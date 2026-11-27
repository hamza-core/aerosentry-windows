using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Used for both create (POST) and update (PUT).
public class LaserGridRequest
{
    [Required, StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [Range(1, 50)]
    public int Rows { get; set; }

    [Range(1, 50)]
    public int Columns { get; set; }

    [Range(0.1, 100)]
    public double SquareSizeMeters { get; set; }
}
