namespace AeroSentry.Api.Data.Entities;

// One step in the life of an alert: who did what, when. Together they form the alert's history.
public class AlertAction
{
    public Guid Id { get; set; }

    public Guid AlertId { get; set; }
    public Alert Alert { get; set; } = null!;

    // "Acknowledge", "MarkFalseAlarm", "Close" or "Escalate" (see AlertTransitions)
    public string Action { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;

    // Who did it. Plain values with no foreign key and a copy of the name: the history must stay
    // readable even after the guard is deleted.
    public Guid ByUserId { get; set; }
    public string ByName { get; set; } = string.Empty;
    public string ByRole { get; set; } = string.Empty;

    public string? Note { get; set; }
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}
