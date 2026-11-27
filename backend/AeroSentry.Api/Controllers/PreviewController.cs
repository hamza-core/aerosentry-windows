using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/detection")]
public class PreviewController : ApiControllerBase
{
    // If no new picture arrives for this long the worker has stopped: end the stream so the app notices and reconnects,
    // instead of showing a frozen picture as if it were live.
    private static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(6);
    private static readonly TimeSpan FirstPictureWait = TimeSpan.FromSeconds(5);

    private readonly IPreviewService _preview;

    public PreviewController(IPreviewService preview)
    {
        _preview = preview;
    }

    // GET /api/v1/detection/preview?propertyId=...&wallId=...      (any role that can see the property)
    // A never-ending picture stream (multipart/x-mixed-replace, like an IP camera's MJPEG) of the wall with the people the
    // model found drawn on it. 404 when the wall is not yours, or when no picture comes in (wall not watched, worker off).
    [HttpGet("preview")]
    public async Task<IActionResult> Preview(Guid propertyId, Guid wallId, CancellationToken cancel)
    {
        if (!await _preview.CanViewAsync(CallerId, CallerRole, propertyId, wallId))
            return Problem(statusCode: 404, title: "Wall not found");

        // A picture older than StaleAfter is from a worker that has stopped: it must not be shown as if it were live.
        bool HasFreshPicture() =>
            _preview.Latest(wallId) is { } latest && DateTime.UtcNow - latest.AtUtc < StaleAfter;

        // Wait a moment for the first picture.
        var giveUp = DateTime.UtcNow + FirstPictureWait;
        while (!HasFreshPicture() && DateTime.UtcNow < giveUp && !cancel.IsCancellationRequested)
            await Task.Delay(100, CancellationToken.None);
        if (!HasFreshPicture())
            return Problem(statusCode: 404, title: "No live picture: the wall is not being watched, or the ingest worker is not running");

        Response.ContentType = "multipart/x-mixed-replace; boundary=frame";
        Response.Headers.CacheControl = "no-store";

        long lastSent = -1;
        var lastNew = DateTime.UtcNow;
        try
        {
            while (!cancel.IsCancellationRequested)
            {
                var frame = _preview.Latest(wallId);
                if (frame is not null && frame.Sequence != lastSent && DateTime.UtcNow - frame.AtUtc < StaleAfter)
                {
                    lastSent = frame.Sequence;
                    lastNew = DateTime.UtcNow;
                    await Response.WriteAsync($"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {frame.Jpeg.Length}\r\n\r\n", cancel);
                    await Response.Body.WriteAsync(frame.Jpeg, cancel);
                    await Response.WriteAsync("\r\n", cancel);
                    await Response.Body.FlushAsync(cancel);
                }
                else if (DateTime.UtcNow - lastNew > StaleAfter)
                {
                    break;
                }
                else
                {
                    await Task.Delay(80, cancel);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The app closed the screen: normal.
        }
        return new EmptyResult();
    }
}
