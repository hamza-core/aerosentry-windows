namespace AeroSentry.Api.Data.Entities;

// One alarm raised by the ML service for a wall. Feature 6 (alerts) builds on these rows.
public class DetectionEvent
{
    public Guid Id { get; set; }

    public Guid WallId { get; set; }
    public Wall Wall { get; set; } = null!;

    // The cell the intruder's foot point was in. Null when it was outside every cell.
    // Stored as plain values (no foreign key): the event must survive when cells are edited or deleted.
    public Guid? CellId { get; set; }
    public string? CellLabel { get; set; }

    public double Probability { get; set; }
    public double Threshold { get; set; }

    // Position in the live stream, and the time the caller said the frame was captured.
    public int FrameNumber { get; set; }
    public double TimestampSeconds { get; set; }

    public string MlSessionId { get; set; } = string.Empty;

    // The picture at the moment of the alarm (JPEG), so a guard can see who it is and an admin can review it later.
    // It can show faces: only the owner and the property's guards can get it (alerts/get-snapshot). Roughly 50 to 150 KB each.
    // Never load it in lists: project the columns that are needed.
    public byte[]? AlarmSnapshot { get; set; }
    public DateTime DetectedAtUtc { get; set; } = DateTime.UtcNow;
}
