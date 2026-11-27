using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Body of walls/save-annotation: only the wall annotation, drawn by the admin on a camera picture.
public class WallAnnotationRequest
{
    // Size of the picture the admin drew on (the X-Frame-Width / X-Frame-Height of cameras/get-snapshot).
    [Range(1, 10000)]
    public int FrameWidth { get; set; }

    [Range(1, 10000)]
    public int FrameHeight { get; set; }

    // 2 to 100 points [x, y] per line, along the edge of the wall, values 0 to 1 (a fraction of the picture's width and height).
    [Required]
    public double[][] WallTopPoints { get; set; } = Array.Empty<double[]>();

    [Required]
    public double[][] WallBottomPoints { get; set; } = Array.Empty<double[]>();
}

// What cameras/get-snapshot returns inside the service (the controller sends the bytes as an image).
public class CameraSnapshot
{
    public byte[] Image { get; set; } = Array.Empty<byte>();
    public int Width { get; set; }
    public int Height { get; set; }
}
