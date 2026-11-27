using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
namespace AeroSentry.Api.Services;

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly PasswordHasher<User> _hasher = new();

    private readonly IConfiguration _config;

    public AuthService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // Returns null when the email is already taken.
    public async Task<UserResponse?> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email))
            return null;

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Email = email,
            Role = "Admin"
        };
        user.PasswordHash = _hasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return new UserResponse
        {
            Id = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            PhoneNumber = user.PhoneNumber,
            Role = user.Role
        };
    }


    public async Task<User?> ValidateCredentialsAsync(LoginRequest request)
{

        var email  = request.Email.Trim().ToLowerInvariant();

        var user = await _db.Users.FirstOrDefaultAsync(u=>u.Email == email);

        if(user is null)
        {
            return null;
        }

        var result = _hasher.VerifyHashedPassword(user,user.PasswordHash, request.Password);

        return result == PasswordVerificationResult.Failed ? null : user;
}

public async Task<LoginResult> LoginAsync(LoginRequest request)
{
    var user = await ValidateCredentialsAsync(request);
    if (user is null)
        return new LoginResult { Status = LoginStatus.InvalidCredentials };

    if (!user.IsActive)
        return new LoginResult { Status = LoginStatus.Suspended };

    var expires = DateTime.UtcNow.AddMinutes(int.Parse(_config["Jwt:ExpiryMinutes"]!));

    var descriptor = new SecurityTokenDescriptor
    {
        Subject = new ClaimsIdentity(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("role", user.Role)
        }),
        Issuer = _config["Jwt:Issuer"],
        Audience = _config["Jwt:Audience"],
        Expires = expires,
        SigningCredentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!)),
            SecurityAlgorithms.HmacSha256)
    };

    var token = new JsonWebTokenHandler().CreateToken(descriptor);

    return new LoginResult
    {
        Status = LoginStatus.Success,
        Response = new LoginResponse
        {
            AccessToken = token,
            ExpiresAtUtc = expires,
            User = new UserResponse
            {
                Id = user.Id,
                FullName = user.FullName,
                Email = user.Email,
                PhoneNumber = user.PhoneNumber,
                Role = user.Role
            }
        }
    };
}

public async Task<UserResponse?> GetUserAsync(Guid id)
{
    var user = await _db.Users.FindAsync(id);
    if (user is null)
        return null;

    return new UserResponse
    {
        Id = user.Id,
        FullName = user.FullName,
        Email = user.Email,
        PhoneNumber = user.PhoneNumber,
        Role = user.Role
    };
}

}
