using System.Net.Sockets;
using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// Admins manage cameras of properties they own. Guards can only read cameras of properties
// they are assigned to. "Not yours" and "does not exist" look the same (null/NotFound -> 404).
public class CameraService : ICameraService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly ICameraSnapshotClient _snapshots;
    private readonly IMediaMtxConfigService _mediaMtx;
    private readonly ILogger<CameraService> _logger;

    public CameraService(AppDbContext db, IConfiguration config, ICameraSnapshotClient snapshots, IMediaMtxConfigService mediaMtx, ILogger<CameraService> logger)
    {
        _db = db;
        _config = config;
        _snapshots = snapshots;
        _mediaMtx = mediaMtx;
        _logger = logger;
    }

    public async Task<List<CameraResponse>?> ListAsync(Guid userId, string role, Guid propertyId)
    {
        if (!await VisibleProperties(userId, role).AnyAsync(p => p.Id == propertyId))
            return null;

        var cameras = await _db.Cameras
            .Where(c => c.PropertyId == propertyId)
            .OrderBy(c => c.Name)
            .ToListAsync();

        return cameras.Select(ToResponse).ToList();
    }

    public async Task<CameraResponse?> GetAsync(Guid userId, string role, Guid propertyId, Guid id)
    {
        if (!await VisibleProperties(userId, role).AnyAsync(p => p.Id == propertyId))
            return null;

        var camera = await _db.Cameras.FirstOrDefaultAsync(c => c.Id == id && c.PropertyId == propertyId);
        return camera is null ? null : ToResponse(camera);
    }

    public async Task<CameraResult> CreateAsync(Guid adminId, Guid propertyId, CameraRequest request)
    {
        if (!await OwnsProperty(adminId, propertyId))
            return new CameraResult { Status = CameraStatus.NotFound };

        var name = request.Name.Trim();
        if (await _db.Cameras.AnyAsync(c => c.PropertyId == propertyId && c.Name == name))
            return new CameraResult { Status = CameraStatus.DuplicateName };

        var camera = new Camera { Id = Guid.NewGuid(), PropertyId = propertyId };
        Apply(camera, request);

        _db.Cameras.Add(camera);
        await _db.SaveChangesAsync();

        await SyncMediaMtxAsync(() => _mediaMtx.SyncCameraAsync(camera));

        return new CameraResult { Status = CameraStatus.Success, Camera = ToResponse(camera) };
    }

    public async Task<CameraResult> UpdateAsync(Guid adminId, Guid propertyId, Guid id, CameraRequest request)
    {
        if (!await OwnsProperty(adminId, propertyId))
            return new CameraResult { Status = CameraStatus.NotFound };

        var camera = await _db.Cameras.FirstOrDefaultAsync(c => c.Id == id && c.PropertyId == propertyId);
        if (camera is null)
            return new CameraResult { Status = CameraStatus.NotFound };

        var name = request.Name.Trim();
        if (await _db.Cameras.AnyAsync(c => c.PropertyId == propertyId && c.Name == name && c.Id != id))
            return new CameraResult { Status = CameraStatus.DuplicateName };

        Apply(camera, request);
        await _db.SaveChangesAsync();

        await SyncMediaMtxAsync(() => _mediaMtx.SyncCameraAsync(camera));

        return new CameraResult { Status = CameraStatus.Success, Camera = ToResponse(camera) };
    }

    public async Task<Result<bool>> DeleteAsync(Guid adminId, Guid propertyId, Guid id)
    {
        if (!await OwnsProperty(adminId, propertyId))
            return Result<bool>.NotFound("Property not found");

        var camera = await _db.Cameras.FirstOrDefaultAsync(c => c.Id == id && c.PropertyId == propertyId);
        if (camera is null)
            return Result<bool>.NotFound("Camera not found");

        if (await _db.Walls.AnyAsync(w => w.CameraId == id))
            return Result<bool>.Conflict("This camera is used by a wall");

        _db.Cameras.Remove(camera);
        await _db.SaveChangesAsync();

        await SyncMediaMtxAsync(() => _mediaMtx.RemoveCameraAsync(id));

        return Result<bool>.Ok(true);
    }

    // Only checks that host:port accepts a TCP connection within 3 seconds.
    // It does not prove that video decodes; that is checked when the stream is used.
    public async Task<CameraTestResponse?> TestAsync(Guid adminId, Guid propertyId, CameraRequest request)
    {
        if (!await OwnsProperty(adminId, propertyId))
            return null;

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(request.Host.Trim(), request.Port, timeout.Token);
            return new CameraTestResponse { Reachable = true, Message = "Connected" };
        }
        catch (OperationCanceledException)
        {
            return new CameraTestResponse { Reachable = false, Message = "Timed out after 3 seconds" };
        }
        catch (SocketException ex)
        {
            return new CameraTestResponse { Reachable = false, Message = ex.SocketErrorCode.ToString() };
        }
    }

    public async Task<Result<CameraSnapshot>> GetSnapshotAsync(Guid adminId, Guid propertyId, Guid cameraId)
    {
        if (!await OwnsProperty(adminId, propertyId))
            return Result<CameraSnapshot>.NotFound("Property not found");

        var camera = await _db.Cameras.FirstOrDefaultAsync(c => c.Id == cameraId && c.PropertyId == propertyId);
        if (camera is null)
            return Result<CameraSnapshot>.NotFound("Camera not found");

        // Without ffmpeg the backend cannot decode RTSP. IP Webcam offers a plain HTTP picture, so it works.
        if (camera.SourceType != "MobileApp")
            return Result<CameraSnapshot>.BadRequest(
                "A snapshot is only available for MobileApp (IP Webcam) cameras. For RTSP and ONVIF cameras, capture a frame from the playback stream.");

        byte[] image;
        try
        {
            image = await _snapshots.GetJpegAsync(camera);
        }
        catch (CameraSnapshotException ex)
        {
            return Result<CameraSnapshot>.Unavailable(ex.Message);
        }

        if (!JpegInfo.TryReadSize(image, out var width, out var height))
            return Result<CameraSnapshot>.Unavailable("The camera did not return a JPEG picture");

        return Result<CameraSnapshot>.Ok(new CameraSnapshot { Image = image, Width = width, Height = height });
    }

    // ---- helpers ----

    private Task<bool> OwnsProperty(Guid adminId, Guid propertyId) =>
        _db.Properties.AnyAsync(p => p.Id == propertyId && p.OwnerAdminId == adminId);

    // Same rule as PropertyService: admin sees own properties, guard sees assigned ones.
    private IQueryable<Property> VisibleProperties(Guid userId, string role)
    {
        return role == "Admin"
            ? _db.Properties.Where(p => p.OwnerAdminId == userId)
            : _db.Properties.Where(p => p.PropertyGuards.Any(pg => pg.GuardId == userId));
    }

    private static void Apply(Camera camera, CameraRequest request)
    {
        var path = request.StreamPath.Trim();
        if (path.Length > 0 && !path.StartsWith('/'))
            path = "/" + path;

        camera.Name = request.Name.Trim();
        camera.SourceType = request.SourceType;
        camera.Host = request.Host.Trim();
        camera.Port = request.Port;
        camera.StreamPath = path;
        camera.Username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
        camera.Password = string.IsNullOrEmpty(request.Password) ? null : request.Password;
        camera.IsActive = request.IsActive;
    }

    // Clients play this URL from the media server (MediaMTX). They never see the camera's address path or password.
    private string PlaybackUrl(Camera c) =>
        $"{(_config["Media:HlsBase"] ?? "http://localhost:8888").TrimEnd('/')}/cam-{c.Id}/index.m3u8";

    private CameraResponse ToResponse(Camera c) => new()
    {
        Id = c.Id,
        PropertyId = c.PropertyId,
        Name = c.Name,
        SourceType = c.SourceType,
        Host = c.Host,
        Port = c.Port,
        StreamPath = c.StreamPath,
        Username = c.Username,
        HasPassword = c.Password is not null,
        PlaybackUrl = PlaybackUrl(c),
        IsActive = c.IsActive,
        CreatedAtUtc = c.CreatedAtUtc
    };

    private async Task SyncMediaMtxAsync(Func<Task> sync)
    {
        try
        {
            await sync();
        }
        catch (Exception ex)
        {
            // Best effort: camera DB record is already saved. Config can be repaired by SyncAll.
            _logger.LogWarning(ex, "Failed to sync MediaMTX config for camera change");
        }
    }
}
