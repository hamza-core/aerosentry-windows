using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Used for both create (POST) and update (PUT).
public class PropertyRequest
{
    [Required, StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(300)]
    public string Address { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Note {get; set;}

    [Range(-90, 90)]
    public double? Latitude { get; set; }

    [Range(-180, 180)]
    public double? Longitude { get; set; }
}
