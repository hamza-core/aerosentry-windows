using AeroSentry.Api.Data.Entities;

namespace AeroSentry.Api.Services;

// The rules of an alert's life, in one place:
//
//   New --acknowledge--> Acknowledged
//   New / Acknowledged --mark-false-alarm--> FalseAlarm        (final)
//   New / Acknowledged / Escalated --close--> Closed           (final)
//   New / Acknowledged --escalate--> Escalated                 (admin only)
//   New / Acknowledged --confirm-authorized--> ConfirmedAuthorized   (final: "I looked, this is an authorized person")
//
// FalseAlarm, Closed and ConfirmedAuthorized are final: nothing can change them any more.
public record AlertTransition(string[] AllowedFrom, string To);

public static class AlertTransitions
{
    public const string Acknowledge = "Acknowledge";
    public const string MarkFalseAlarm = "MarkFalseAlarm";
    public const string Close = "Close";
    public const string Escalate = "Escalate";
    public const string ConfirmAuthorized = "ConfirmAuthorized";

    public static readonly Dictionary<string, AlertTransition> Rules = new()
    {
        [Acknowledge] = new(new[] { AlertStatus.New }, AlertStatus.Acknowledged),
        [MarkFalseAlarm] = new(new[] { AlertStatus.New, AlertStatus.Acknowledged }, AlertStatus.FalseAlarm),
        [Close] = new(new[] { AlertStatus.New, AlertStatus.Acknowledged, AlertStatus.Escalated }, AlertStatus.Closed),
        [Escalate] = new(new[] { AlertStatus.New, AlertStatus.Acknowledged }, AlertStatus.Escalated),
        [ConfirmAuthorized] = new(new[] { AlertStatus.New, AlertStatus.Acknowledged }, AlertStatus.ConfirmedAuthorized)
    };
}
