using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// One item of the list sent to PUT .../walls/{id}/cells. Each point is [x, y] with values 0 to 1.
public class WallCellRequest
{
    [Required, StringLength(50)]
    public string Label { get; set; } = string.Empty;

    [Range(0.1, 100000)]
    public double LengthMeters { get; set; }

    [Required] public double[] TopLeft { get; set; } = Array.Empty<double>();
    [Required] public double[] BottomLeft { get; set; } = Array.Empty<double>();
    [Required] public double[] TopRight { get; set; } = Array.Empty<double>();
    [Required] public double[] BottomRight { get; set; } = Array.Empty<double>();
}
