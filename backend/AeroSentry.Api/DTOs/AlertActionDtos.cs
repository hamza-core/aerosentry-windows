using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// Optional body of acknowledge, mark-false-alarm, close and escalate.
public class AlertActionRequest
{
    [StringLength(500)]
    public string? Note { get; set; }
}

public class AlertActionResponse
{
    public Guid Id { get; set; }
    public Guid AlertId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public Guid ByUserId { get; set; }
    public string ByName { get; set; } = string.Empty;
    public string ByRole { get; set; } = string.Empty;
    public string? Note { get; set; }
    public DateTime AtUtc { get; set; }
}
