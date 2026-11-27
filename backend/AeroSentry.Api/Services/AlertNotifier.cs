using AeroSentry.Api.Data;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Hubs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

public class AlertNotifier : IAlertNotifier
{
    private readonly AppDbContext _db;
    private readonly IHubContext<AlertsHub> _hub;

    public AlertNotifier(AppDbContext db, IHubContext<AlertsHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    public async Task NotifyAsync(AlertResponse alert, string eventName)
    {
        // Who may see this property's alerts: its owner, and every ACTIVE guard assigned to it.
        // Worked out now (not when a client connects), so a guard assigned or suspended a minute ago is handled right.
        var owner = await _db.Properties
            .Where(p => p.Id == alert.PropertyId && p.OwnerAdmin.IsActive)
            .Select(p => p.OwnerAdminId)
            .ToListAsync();

        var guards = await _db.PropertyGuards
            .Where(pg => pg.PropertyId == alert.PropertyId && pg.Guard.IsActive)
            .Select(pg => pg.GuardId)
            .ToListAsync();

        var recipients = owner.Concat(guards).Select(id => id.ToString()).Distinct().ToList();
        if (recipients.Count == 0)
            return;

        await _hub.Clients.Users(recipients).SendAsync(eventName, alert);
    }
}
