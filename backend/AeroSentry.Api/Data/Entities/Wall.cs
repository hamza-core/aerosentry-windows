namespace AeroSentry.Api.Data.Entities;

// One wall as seen by one camera. The admin draws the wall annotation (top line and bottom line)
// on the camera frame; the ML model needs it to run.
public class Wall
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public Guid CameraId { get; set; }
    public Camera Camera { get; set; } = null!;

    // ---- wall annotation (normalised 0-1 coordinates, same shape the ML service expects) ----
    public int FrameWidth { get; set; }
    public int FrameHeight { get; set; }
    // JSON text, e.g. [[0.80,0.44],[0.38,0.83]] : 2 to 100 points per line.
    public string TopPointsJson { get; set; } = "[]";
    public string BottomPointsJson { get; set; } = "[]";

    // ---- laser grid mapping (optional until the admin reaches that step) ----
    public Guid? LaserGridId { get; set; }
    public LaserGrid? LaserGrid { get; set; }
    public int? CameraGridRow { get; set; }
    public int? CameraGridCol { get; set; }

    // ---- is this wall being watched? Saved in the database so it survives a backend restart ----
    public bool DetectionEnabled { get; set; }
    public double? DetectionThreshold { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<WallCell> Cells { get; set; } = new();
}
