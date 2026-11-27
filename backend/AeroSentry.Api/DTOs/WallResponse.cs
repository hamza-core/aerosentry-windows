namespace AeroSentry.Api.DTOs;

public class WallResponse
{
    public Guid Id { get; set; }
    public Guid PropertyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid CameraId { get; set; }
    public string CameraName { get; set; } = string.Empty;
    public int FrameWidth { get; set; }
    public int FrameHeight { get; set; }
    public double[][] WallTopPoints { get; set; } = Array.Empty<double[]>();
    public double[][] WallBottomPoints { get; set; } = Array.Empty<double[]>();
    public Guid? LaserGridId { get; set; }
    public int? CameraGridRow { get; set; }
    public int? CameraGridCol { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    // True while the wall is being watched (after detection/start, until detection/stop).
    public bool DetectionEnabled { get; set; }

    public double TotalLengthMeters { get; set; }
    public List<WallCellResponse> Cells { get; set; } = new();
}
