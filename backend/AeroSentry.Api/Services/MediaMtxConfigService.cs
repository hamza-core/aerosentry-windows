using System.Text;
using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

public class MediaMtxConfigService : IMediaMtxConfigService
{
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<MediaMtxConfigService> _logger;

    public MediaMtxConfigService(AppDbContext db, IConfiguration config, ILogger<MediaMtxConfigService> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    public async Task SyncCameraAsync(Camera camera, CancellationToken ct = default)
    {
        if (!IsEnabled(out var path))
            return;

        await Gate.WaitAsync(ct);
        try
        {
            var cameras = await LoadCamerasAsync(ct);
            Upsert(cameras, camera);
            await WriteAsync(path, cameras, ct);
        }
        finally
        {
            Gate.Release();
        }
    }

    public async Task RemoveCameraAsync(Guid cameraId, CancellationToken ct = default)
    {
        if (!IsEnabled(out var path))
            return;

        await Gate.WaitAsync(ct);
        try
        {
            var cameras = await LoadCamerasAsync(ct);
            cameras.RemoveAll(c => c.Id == cameraId);
            await WriteAsync(path, cameras, ct);
        }
        finally
        {
            Gate.Release();
        }
    }

    public async Task SyncAllAsync(CancellationToken ct = default)
    {
        if (!IsEnabled(out var path))
            return;

        await Gate.WaitAsync(ct);
        try
        {
            var cameras = await LoadCamerasAsync(ct);
            await WriteAsync(path, cameras, ct);
        }
        finally
        {
            Gate.Release();
        }
    }

    private bool IsEnabled(out string path)
    {
        path = _config["Media:MtxConfigPath"] ?? string.Empty;
        var enabled = _config.GetValue<bool?>("Media:MtxManageConfig") ?? false;
        if (!enabled || string.IsNullOrWhiteSpace(path))
        {
            path = string.Empty;
            return false;
        }
        return true;
    }

    private async Task<List<Camera>> LoadCamerasAsync(CancellationToken ct)
    {
        return await _db.Cameras
            .AsNoTracking()
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync(ct);
    }

    private static void Upsert(List<Camera> cameras, Camera camera)
    {
        var index = cameras.FindIndex(c => c.Id == camera.Id);
        if (index >= 0)
            cameras[index] = camera;
        else
            cameras.Add(camera);
    }

    private async Task WriteAsync(string path, List<Camera> cameras, CancellationToken ct)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        var yaml = BuildYaml(cameras);
        var tmp = path + ".tmp";
        await File.WriteAllTextAsync(tmp, yaml, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), ct);
        File.Move(tmp, path, overwrite: true);
        _logger.LogInformation("MediaMTX config synced: {Path} ({Count} camera paths)", path, cameras.Count);
    }

    private static string BuildYaml(List<Camera> cameras)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Managed by AeroSentry backend (Media:MtxManageConfig=true).");
        sb.AppendLine("# This file is regenerated from camera records. Manual edits may be overwritten.");
        sb.AppendLine("# Camera path names are cam-<cameraId> to match backend playback/worker URLs.");
        sb.AppendLine();
        sb.AppendLine("logLevel: info");
        sb.AppendLine();
        sb.AppendLine("paths:");

        if (cameras.Count == 0)
        {
            sb.AppendLine("  {}");
            return sb.ToString();
        }

        foreach (var camera in cameras)
        {
            sb.AppendLine($"  cam-{camera.Id}:");
            sb.AppendLine($"    source: \"{EscapeYamlDoubleQuoted(BuildSourceUrl(camera))}\"");
            sb.AppendLine("    rtspTransport: tcp");
            sb.AppendLine("    sourceOnDemand: yes");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    // Build the camera source URL MediaMTX should pull.
    // For IP Webcam, use an RTSP path like /h264.sdp. MediaMTX cannot pull MJPEG /video.
    private static string BuildSourceUrl(Camera c)
    {
        var scheme = c.SourceType switch
        {
            "Rtsp" or "Onvif" => "rtsp",
            "MobileApp" when c.StreamPath.EndsWith(".sdp", StringComparison.OrdinalIgnoreCase) => "rtsp",
            "MobileApp" => "http",
            _ => "rtsp"
        };

        var login = "";
        if (!string.IsNullOrWhiteSpace(c.Username))
        {
            login = Uri.EscapeDataString(c.Username);
            if (!string.IsNullOrEmpty(c.Password))
                login += ":" + Uri.EscapeDataString(c.Password);
            login += "@";
        }

        var path = c.StreamPath ?? "";
        if (path.Length > 0 && !path.StartsWith('/'))
            path = "/" + path;

        return $"{scheme}://{login}{c.Host}:{c.Port}{path}";
    }

    private static string EscapeYamlDoubleQuoted(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");
}
