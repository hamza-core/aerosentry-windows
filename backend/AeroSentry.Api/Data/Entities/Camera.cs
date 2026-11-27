namespace AeroSentry.Api.Data.Entities;

public class Camera
{
    public Guid Id { get; set; }

    // The property this camera watches (foreign key to Properties).
    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    // "MobileApp" (IP Webcam), "Onvif" or "Rtsp". Kept as text so the database is readable.
    public string SourceType { get; set; } = string.Empty;

    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string StreamPath { get; set; } = string.Empty;

    // Optional. The backend needs them to open the stream, so they are stored; the API never returns the password.
    public string? Username { get; set; }
    public string? Password { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
