using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/detection")]
public class DetectionController : ApiControllerBase
{
    private readonly IDetectionService _detection;

    public DetectionController(IDetectionService detection)
    {
        _detection = detection;
    }

    // POST /api/v1/detection/start?propertyId=...&wallId=...[&threshold=0.5]
    [HttpPost("start")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Start(Guid propertyId, Guid wallId, double? threshold) =>
        FromResult(await _detection.StartAsync(CallerId, propertyId, wallId, threshold));

    // POST /api/v1/detection/send-frame?propertyId=...&wallId=...
    // multipart/form-data: frame (JPEG file), optional frameIndex and timestampSeconds.
    [HttpPost("send-frame")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SendFrame(Guid propertyId, Guid wallId, [FromForm] DetectionFrameRequest request)
    {
        using var buffer = new MemoryStream();
        await request.Frame.CopyToAsync(buffer);

        return FromResult(await _detection.FrameAsync(
            CallerId, propertyId, wallId, buffer.ToArray(), request.FrameIndex, request.TimestampSeconds));
    }

    // POST /api/v1/detection/stop?propertyId=...&wallId=...
    [HttpPost("stop")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Stop(Guid propertyId, Guid wallId) =>
        FromResult(await _detection.StopAsync(CallerId, propertyId, wallId));

    // GET /api/v1/detection/list-events?propertyId=...&wallId=...&page=1&pageSize=20
    [HttpGet("list-events")]
    public async Task<IActionResult> ListEvents(Guid propertyId, Guid wallId, int page = 1, int pageSize = 20) =>
        FromResult(await _detection.ListEventsAsync(CallerId, CallerRole, propertyId, wallId, page, pageSize));
}
