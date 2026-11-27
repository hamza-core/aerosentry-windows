using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Used for create (POST), update (PUT) and the connection test.
public class CameraRequest
{
    [Required, StringLength(200)]
    public string Name { get; set; } = string.Empty;

    // "MobileApp", "Onvif" or "Rtsp"
    [Required, RegularExpression("^(MobileApp|Onvif|Rtsp)$")]
    public string SourceType { get; set; } = string.Empty;

    [Required, StringLength(255)]
    public string Host { get; set; } = string.Empty;

    [Range(1, 65535)]
    public int Port { get; set; }

    [StringLength(300)]
    public string StreamPath { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Username { get; set; }

    [StringLength(200)]
    public string? Password { get; set; }

    public bool IsActive { get; set; } = true;
}
