using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/alerts")]
public class AlertsController : ApiControllerBase
{
    private readonly IAlertService _alerts;

    public AlertsController(IAlertService alerts)
    {
        _alerts = alerts;
    }

    // GET /api/v1/alerts/list[?propertyId=...][&status=New][&page=1&pageSize=20]
    // Newest first. Without propertyId: every property the caller can see (admin: own, guard: assigned).
    [HttpGet("list")]
    public async Task<IActionResult> List(Guid? propertyId, string? status, int page = 1, int pageSize = 20) =>
        FromResult(await _alerts.ListAsync(CallerId, CallerRole, propertyId, status, page, pageSize));

    // GET /api/v1/alerts/get?alertId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid alertId) =>
        FromResult(await _alerts.GetAsync(CallerId, CallerRole, alertId));

    // ---- alert actions (admins and assigned guards; escalate is admin only) ----
    // Each returns the updated alert and pushes "AlertUpdated" over SignalR. Optional body: { "note": "..." }.
    // 409 when the alert's status does not allow the action (see the rules in AlertTransitions).

    // POST /api/v1/alerts/acknowledge?alertId=...      New -> Acknowledged
    [HttpPost("acknowledge")]
    public async Task<IActionResult> Acknowledge(Guid alertId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AlertActionRequest? request = null) =>
        FromResult(await _alerts.ChangeStatusAsync(CallerId, CallerRole, alertId, AlertTransitions.Acknowledge, request?.Note));

    // POST /api/v1/alerts/mark-false-alarm?alertId=... New or Acknowledged -> FalseAlarm
    [HttpPost("mark-false-alarm")]
    public async Task<IActionResult> MarkFalseAlarm(Guid alertId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AlertActionRequest? request = null) =>
        FromResult(await _alerts.ChangeStatusAsync(CallerId, CallerRole, alertId, AlertTransitions.MarkFalseAlarm, request?.Note));

    // POST /api/v1/alerts/close?alertId=...            New, Acknowledged or Escalated -> Closed
    [HttpPost("close")]
    public async Task<IActionResult> Close(Guid alertId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AlertActionRequest? request = null) =>
        FromResult(await _alerts.ChangeStatusAsync(CallerId, CallerRole, alertId, AlertTransitions.Close, request?.Note));

    // POST /api/v1/alerts/escalate?alertId=...         New or Acknowledged -> Escalated (admin only)
    [HttpPost("escalate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Escalate(Guid alertId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AlertActionRequest? request = null) =>
        FromResult(await _alerts.ChangeStatusAsync(CallerId, CallerRole, alertId, AlertTransitions.Escalate, request?.Note));

    // POST /api/v1/alerts/confirm-authorized?alertId=...   New or Acknowledged -> ConfirmedAuthorized
    // "I looked at the picture and this is an authorized person." For an alert whose person the system did or did not recognise.
    // Final, recorded in the history with who confirmed it. Note: { "note": "Imran, wall maintenance" }.
    [HttpPost("confirm-authorized")]
    public async Task<IActionResult> ConfirmAuthorized(Guid alertId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AlertActionRequest? request = null) =>
        FromResult(await _alerts.ChangeStatusAsync(CallerId, CallerRole, alertId, AlertTransitions.ConfirmAuthorized, request?.Note));

    // GET /api/v1/alerts/get-snapshot?alertId=...   the picture taken at the moment of the alarm (image/jpeg), to see who it is
    [HttpGet("get-snapshot")]
    public async Task<IActionResult> GetSnapshot(Guid alertId)
    {
        var result = await _alerts.GetSnapshotAsync(CallerId, CallerRole, alertId);
        return result.Status == ResultStatus.Success ? File(result.Value!.Bytes, result.Value.ContentType) : FromResult(result);
    }

    // GET /api/v1/alerts/list-actions?alertId=...      who did what, oldest first
    [HttpGet("list-actions")]
    public async Task<IActionResult> ListActions(Guid alertId) =>
        FromResult(await _alerts.ListActionsAsync(CallerId, CallerRole, alertId));
}
