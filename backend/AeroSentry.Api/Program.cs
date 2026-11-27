using Scalar.AspNetCore;
using AeroSentry.Api.Data;
using AeroSentry.Api.Services;
using AeroSentry.Api.Hubs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
var builder = WebApplication.CreateBuilder(args);

// Secrets (database password, JWT key, worker key) live in appsettings.Local.json. It is NOT in git: copy
// appsettings.Local.example.json to appsettings.Local.json and fill it in. It is loaded after appsettings.json, and
// environment variables and command-line values are added again after it, so they still win over it.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddCommandLine(args);

// Stop at once, with a clear message, when a required secret is missing, instead of crashing deep inside a request.
// (A value still starting with "CHANGE-ME" is the example's placeholder: it counts as missing.)
bool NotSet(string? value) => string.IsNullOrWhiteSpace(value) || value.StartsWith("CHANGE-ME");
var problems = new List<string>();
if (NotSet(builder.Configuration["ConnectionStrings:DefaultConnection"])) problems.Add("ConnectionStrings:DefaultConnection (the SQL Server connection string)");
if (NotSet(builder.Configuration["Jwt:Key"])) problems.Add("Jwt:Key (a long random text used to sign login tokens)");
else if (builder.Configuration["Jwt:Key"]!.Length < 32) problems.Add("Jwt:Key is too short: it must be at least 32 characters");
if (problems.Count > 0)
    throw new InvalidOperationException(
        "Missing or invalid settings:\n  - " + string.Join("\n  - ", problems) +
        "\nCopy AeroSentry.Api/appsettings.Local.example.json to appsettings.Local.json and fill it in (it is not committed to git).");

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GuardService>();
builder.Services.AddScoped<PropertyService>();
builder.Services.AddScoped<ICameraService, CameraService>();
builder.Services.AddScoped<IMediaMtxConfigService, MediaMtxConfigService>();
builder.Services.AddScoped<ILaserGridService, LaserGridService>();
builder.Services.AddScoped<IWallService, WallService>();
builder.Services.AddScoped<IWallCellService, WallCellService>();

// The ML service is a separate local program (port 8010). One typed HttpClient talks to it.
builder.Services.AddHttpClient<IMlClient, MlClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Ml:BaseUrl"] ?? "http://localhost:8010");
    client.Timeout = TimeSpan.FromSeconds(15);
});
// A separate typed client takes a still picture from IP Webcam phones (for drawing the wall annotation).
builder.Services.AddHttpClient<ICameraSnapshotClient, CameraSnapshotClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(6);
    client.MaxResponseContentBufferSize = 10 * 1024 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    ConnectCallback = async (context, cancellationToken) =>
    {
        var socket = new System.Net.Sockets.Socket(System.Net.Sockets.AddressFamily.InterNetwork, System.Net.Sockets.SocketType.Stream, System.Net.Sockets.ProtocolType.Tcp);
        socket.NoDelay = true;
        try
        {
            await socket.ConnectAsync(context.DnsEndPoint.Host, context.DnsEndPoint.Port, cancellationToken);
            return new System.Net.Sockets.NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }
});
// The face service (port 8020) finds faces in pictures; people are stored and matched here in the backend.
builder.Services.AddHttpClient<IFaceClient, FaceClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Face:BaseUrl"] ?? "http://localhost:8020");
    client.Timeout = TimeSpan.FromSeconds(150);   // a video of 10 to 20 seconds takes the face service about 10 s
    client.MaxResponseContentBufferSize = 20 * 1024 * 1024;
});
builder.Services.AddScoped<IPersonService, PersonService>();
builder.Services.AddSingleton<DetectionSessions>();   // one shared wall -> ML session map
builder.Services.AddScoped<IDetectionService, DetectionService>();
builder.Services.AddSingleton<PreviewStore>();   // the latest live-preview picture of each wall, in memory
builder.Services.AddScoped<IPreviewService, PreviewService>();

// Alerts: stored in the database, pushed live over SignalR (hub at /hubs/alerts).
builder.Services.AddScoped<IAlertService, AlertService>();
builder.Services.AddScoped<IAlertNotifier, AlertNotifier>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<ConnectionTracker>();   // open hub connections per user, so they can be closed
builder.Services.AddSingleton<IUserIdProvider, SubUserIdProvider>();   // "send to user X" = the token's sub claim

// CORS: browsers (the ReactJS client) may only call the API from origins listed here.
// Phones and desktop apps ignore CORS. Add the demo machine's address in Cors:Origins when running on a LAN.
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
                  ?? new[] { "http://localhost:3000", "http://localhost:5173" };
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()
          // A browser may only read these two response headers (the snapshot's size) if we say so.
          .WithExposedHeaders("X-Frame-Width", "X-Frame-Height")));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            RoleClaimType = "role"
        };

        options.Events = new JwtBearerEvents
        {
            // Browsers cannot put a header on a WebSocket, so for the SignalR hub the token comes
            // in the query string (?access_token=...). Only accepted on /hubs paths.
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    context.Token = token;
                return Task.CompletedTask;
            },

            OnTokenValidated = async context =>
            {
                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var sub = context.Principal?.FindFirst("sub")?.Value;

                if (!Guid.TryParse(sub, out var id) ||
                    !await db.Users.AnyAsync(u => u.Id == id && u.IsActive))
                {
                    context.Fail("User is inactive or no longer exists.");
                }
            }
        };
    });


var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{    
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<AlertsHub>("/hubs/alerts", options =>
{
    // When the token of an open connection expires, close the connection (the app logs in again).
    options.CloseOnAuthenticationExpiration = true;
});

// Best effort: if MediaMTX auto-config is enabled, regenerate the managed config from DB cameras.
using (var scope = app.Services.CreateScope())
{
    var mtx = scope.ServiceProvider.GetRequiredService<IMediaMtxConfigService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    try
    {
        await mtx.SyncAllAsync();
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not sync MediaMTX config on startup");
    }
}

app.Run();
