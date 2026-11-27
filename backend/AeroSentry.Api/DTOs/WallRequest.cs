using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Used for both create (POST) and update (PUT).
public class WallRequest
{
    [Required, StringLength(200)]
    public string Name { get; set; } = string.Empty;

    public Guid CameraId { get; set; }

    // Size of the camera frame the admin drew on.
    [Range(1, 10000)]
    public int FrameWidth { get; set; }

    [Range(1, 10000)]
    public int FrameHeight { get; set; }

    // Wall annotation: 2 to 100 points [x, y] per line, along the edge of the wall, values 0 to 1.
    [Required]
    public double[][] WallTopPoints { get; set; } = Array.Empty<double[]>();

    [Required]
    public double[][] WallBottomPoints { get; set; } = Array.Empty<double[]>();

    // Optional laser grid mapping.
    public Guid? LaserGridId { get; set; }
    public int? CameraGridRow { get; set; }
    public int? CameraGridCol { get; set; }
}
