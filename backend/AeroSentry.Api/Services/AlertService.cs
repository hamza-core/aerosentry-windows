using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

public class AlertService : IAlertService
{
    private readonly AppDbContext _db;
    private readonly IAlertNotifier _notifier;
    private readonly ILogger<AlertService> _logger;

    public AlertService(AppDbContext db, IAlertNotifier notifier, ILogger<AlertService> logger)
    {
        _db = db;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task<AlertResponse> CreateForDetectionAsync(DetectionEvent detection, Guid propertyId, RecognizedPersonDto? recognized = null, bool autoResponseSkipped = false)
    {
        var alert = new Alert
        {
            DetectionEvent = detection,   // links by navigation: both rows are saved together below
            PropertyId = propertyId,
            WallId = detection.WallId,
            CellId = detection.CellId,
            CellLabel = detection.CellLabel,
            Probability = detection.Probability,
            RecognizedPersonId = recognized?.Id,
            RecognizedPersonName = recognized?.Name,
            RecognizedPersonCategory = recognized?.Category,
            RecognitionScore = recognized?.Score,
            AutoResponseSkipped = autoResponseSkipped
        };

        _db.Alerts.Add(alert);
        await _db.SaveChangesAsync();   // saves the detection event and the alert in one go

        var response = await LoadResponseAsync(alert.Id);

        // The alert is safely stored. A failed push (nobody listening, hub hiccup) must not fail the frame.
        try
        {
            await _notifier.NotifyAsync(response, "AlertRaised");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not push alert {Code} over SignalR", response.IncidentCode);
        }

        return response;
    }

    public async Task<Result<AlertResponse>> ChangeStatusAsync(
        Guid userId, string role, Guid alertId, string action, string? note)
    {
        var rule = AlertTransitions.Rules[action];

        // Only alerts of properties this user can see.
        var visible = _db.VisibleProperties(userId, role).Select(p => p.Id);
        if (!await _db.Alerts.AnyAsync(a => a.Id == alertId && visible.Contains(a.PropertyId)))
            return Result<AlertResponse>.NotFound("Alert not found");

        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == userId);

        await using var tx = await _db.Database.BeginTransactionAsync();

        var current = await _db.Alerts.Where(a => a.Id == alertId).Select(a => a.Status).FirstAsync();
        if (!rule.AllowedFrom.Contains(current))
            return Result<AlertResponse>.Conflict($"This alert is {current}, so it cannot be changed with '{action}'");

        // Compare-and-set: change the status only if it is STILL what we just read. If two people press a
        // button at the same moment, exactly one wins and the other gets a 409.
        var to = rule.To;
        var changed = await _db.Alerts
            .Where(a => a.Id == alertId && a.Status == current)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, to));
        if (changed == 0)
            return Result<AlertResponse>.Conflict("Someone else just changed this alert. Reload it and try again");

        _db.AlertActions.Add(new AlertAction
        {
            AlertId = alertId,
            Action = action,
            FromStatus = current,
            ToStatus = to,
            ByUserId = userId,
            ByName = user.FullName,
            ByRole = user.Role,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim()
        });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        var response = await LoadResponseAsync(alertId);

        try
        {
            await _notifier.NotifyAsync(response, "AlertUpdated");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not push the update of alert {Code} over SignalR", response.IncidentCode);
        }

        return Result<AlertResponse>.Ok(response);
    }

    public async Task<Result<List<AlertActionResponse>>> ListActionsAsync(Guid userId, string role, Guid alertId)
    {
        var visible = _db.VisibleProperties(userId, role).Select(p => p.Id);
        if (!await _db.Alerts.AnyAsync(a => a.Id == alertId && visible.Contains(a.PropertyId)))
            return Result<List<AlertActionResponse>>.NotFound("Alert not found");

        var actions = await _db.AlertActions
            .Where(a => a.AlertId == alertId)
            .OrderBy(a => a.AtUtc)
            .ToListAsync();

        return Result<List<AlertActionResponse>>.Ok(actions.Select(a => new AlertActionResponse
        {
            Id = a.Id,
            AlertId = a.AlertId,
            Action = a.Action,
            FromStatus = a.FromStatus,
            ToStatus = a.ToStatus,
            ByUserId = a.ByUserId,
            ByName = a.ByName,
            ByRole = a.ByRole,
            Note = a.Note,
            AtUtc = a.AtUtc
        }).ToList());
    }

    public async Task<Result<PagedResponse<AlertResponse>>> ListAsync(
        Guid userId, string role, Guid? propertyId, string? status, int page, int pageSize)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
            return Result<PagedResponse<AlertResponse>>.BadRequest("page must be 1 or more and pageSize from 1 to 100");

        if (status is not null && !AlertStatus.All.Contains(status))
            return Result<PagedResponse<AlertResponse>>.BadRequest($"status must be one of: {string.Join(", ", AlertStatus.All)}");

        if (propertyId is not null && !await _db.CanSeeProperty(userId, role, propertyId.Value))
            return Result<PagedResponse<AlertResponse>>.NotFound("Property not found");

        var visible = _db.VisibleProperties(userId, role).Select(p => p.Id);
        var query = _db.Alerts.Where(a => visible.Contains(a.PropertyId));

        if (propertyId is not null)
            query = query.Where(a => a.PropertyId == propertyId);
        if (status is not null)
            query = query.Where(a => a.Status == status);

        var total = await query.CountAsync();
        var rows = await query
            .Include(a => a.Property)
            .Include(a => a.Wall).ThenInclude(w => w.Camera)
            .OrderByDescending(a => a.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Result<PagedResponse<AlertResponse>>.Ok(new PagedResponse<AlertResponse>
        {
            Items = rows.Select(ToResponse).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        });
    }

    public async Task<Result<AlertResponse>> GetAsync(Guid userId, string role, Guid alertId)
    {
        var visible = _db.VisibleProperties(userId, role).Select(p => p.Id);

        var alert = await _db.Alerts
            .Include(a => a.Property)
            .Include(a => a.Wall).ThenInclude(w => w.Camera)
            .FirstOrDefaultAsync(a => a.Id == alertId && visible.Contains(a.PropertyId));

        return alert is null
            ? Result<AlertResponse>.NotFound("Alert not found")
            : Result<AlertResponse>.Ok(ToResponse(alert));
    }

    public async Task<Result<PhotoUpload>> GetSnapshotAsync(Guid userId, string role, Guid alertId)
    {
        var visible = _db.VisibleProperties(userId, role).Select(p => p.Id);

        // Only this one column is read (the picture is big), and only for an alert the caller may see.
        var found = await _db.Alerts
            .Where(a => a.Id == alertId && visible.Contains(a.PropertyId))
            .Select(a => new { Snapshot = a.DetectionEvent.AlarmSnapshot })
            .FirstOrDefaultAsync();

        if (found is null)
            return Result<PhotoUpload>.NotFound("Alert not found");
        if (found.Snapshot is null)
            return Result<PhotoUpload>.NotFound("This alert has no picture");
        return Result<PhotoUpload>.Ok(new PhotoUpload(found.Snapshot, "image/jpeg"));
    }

    // ---- helpers ----

    private async Task<AlertResponse> LoadResponseAsync(Guid alertId)
    {
        var alert = await _db.Alerts
            .Include(a => a.Property)
            .Include(a => a.Wall).ThenInclude(w => w.Camera)
            .FirstAsync(a => a.Id == alertId);

        return ToResponse(alert);
    }

    private static AlertResponse ToResponse(Alert a) => new()
    {
        Id = a.Id,
        Number = a.Number,
        IncidentCode = $"INC-{a.Number:D4}",
        Status = a.Status,
        PropertyId = a.PropertyId,
        PropertyName = a.Property.Name,
        WallId = a.WallId,
        WallName = a.Wall.Name,
        CameraId = a.Wall.CameraId,
        CameraName = a.Wall.Camera.Name,
        CellId = a.CellId,
        CellLabel = a.CellLabel,
        Probability = a.Probability,
        RecognizedPerson = a.RecognizedPersonId is null ? null : new RecognizedPersonDto
        {
            Id = a.RecognizedPersonId.Value,
            Name = a.RecognizedPersonName ?? "",
            Category = a.RecognizedPersonCategory ?? "",
            Score = a.RecognitionScore ?? 0
        },
        AutoResponseSkipped = a.AutoResponseSkipped,
        DetectionEventId = a.DetectionEventId,
        CreatedAtUtc = a.CreatedAtUtc
    };
}
