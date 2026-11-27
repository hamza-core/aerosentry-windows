namespace AeroSentry.Api.DTOs;

// The same shape is returned by the REST functions and pushed over SignalR ("AlertRaised").
public class AlertResponse
{
    public Guid Id { get; set; }
    public int Number { get; set; }

    // "INC-0042"
    public string IncidentCode { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public Guid PropertyId { get; set; }
    public string PropertyName { get; set; } = string.Empty;
    public Guid WallId { get; set; }
    public string WallName { get; set; } = string.Empty;
    public Guid CameraId { get; set; }
    public string CameraName { get; set; } = string.Empty;

    // Where the intruder is. Null when the person was outside every marked cell.
    public Guid? CellId { get; set; }
    public string? CellLabel { get; set; }

    public double Probability { get; set; }

    // Set when the person at the wall was recognised as an authorized enrolled person. Null otherwise
    // (which is the usual case: faces at a wall camera are often too small to recognise).
    public RecognizedPersonDto? RecognizedPerson { get; set; }

    // True when no automatic response (drone) is sent because every person at the wall was recognised as authorized.
    // The alert still exists and still needs a guard to look at it and confirm (alerts/confirm-authorized).
    public bool AutoResponseSkipped { get; set; }

    public Guid DetectionEventId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
