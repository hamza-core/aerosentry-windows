namespace AeroSentry.Api.DTOs;

public class CameraResponse
{
    public Guid Id { get; set; }
    public Guid PropertyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string StreamPath { get; set; } = string.Empty;
    public string? Username { get; set; }
    public bool HasPassword { get; set; }
    public string PlaybackUrl { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
