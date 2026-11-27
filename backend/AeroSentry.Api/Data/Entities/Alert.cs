namespace AeroSentry.Api.Data.Entities;

// One incident shown to the owner and the guards. Created automatically for every alarm
// the detection bridge stores (one DetectionEvent -> one Alert).
public class Alert
{
    public Guid Id { get; set; }

    // Human-friendly incident number (INC-0042). The database counts it up by itself (IDENTITY column).
    public int Number { get; set; }

    public Guid DetectionEventId { get; set; }
    public DetectionEvent DetectionEvent { get; set; } = null!;

    // Copied from where the alarm happened, so lists and permission checks need no extra joins.
    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public Guid WallId { get; set; }
    public Wall Wall { get; set; } = null!;

    // The cell the intruder was in (null if outside every cell). Plain values, like on DetectionEvent.
    public Guid? CellId { get; set; }
    public string? CellLabel { get; set; }

    public double Probability { get; set; }

    // Set when the person at the wall was recognised as an AUTHORIZED enrolled person (resident, employee, visitor).
    // It only informs: the alert is still created and still needs a person to look at it. Plain values, no foreign key,
    // so the alert keeps the name even if the person is later removed.
    public Guid? RecognizedPersonId { get; set; }
    public string? RecognizedPersonName { get; set; }
    public string? RecognizedPersonCategory { get; set; }
    public double? RecognitionScore { get; set; }

    // True when the automatic response (the drone, Feature 8/10) must NOT be sent for this alert, because every person
    // at the wall was recognised as an authorized person. The alert itself is never suppressed: a guard still sees it
    // and confirms it (see AlertTransitions.ConfirmAuthorized). Whatever sends drones must check this flag.
    public bool AutoResponseSkipped { get; set; }

    // See AlertStatus. Feature 7 (alert actions) moves an alert from New to the other states.
    public string Status { get; set; } = AlertStatus.New;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// Kept as text in the database so rows are readable.
public static class AlertStatus
{
    public const string New = "New";
    public const string Acknowledged = "Acknowledged";
    public const string FalseAlarm = "FalseAlarm";
    public const string Closed = "Closed";
    public const string Escalated = "Escalated";
    // A guard or admin looked at it and confirmed the person is authorized.
    public const string ConfirmedAuthorized = "ConfirmedAuthorized";

    public static readonly string[] All = { New, Acknowledged, FalseAlarm, Closed, Escalated, ConfirmedAuthorized };
}
