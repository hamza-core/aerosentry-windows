using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

// Pushes an alert to everyone who may see it, over SignalR.
public interface IAlertNotifier
{
    // eventName: "AlertRaised" (new alert) or "AlertUpdated" (its status changed).
    Task NotifyAsync(AlertResponse alert, string eventName);
}
