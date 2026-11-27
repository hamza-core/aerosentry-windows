using System.Security.Cryptography;
using System.Text;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

// For the ingest worker, a separate program that reads the camera streams.
// It has no user account, so it proves itself with a shared key in the X-Worker-Key header
// (config key Worker:ApiKey). Users' JWT tokens do not work here, and the worker's key
// works nowhere else.
[Route("api/v1/worker")]
[AllowAnonymous]   // overrides the [Authorize] of the base class; the key is checked below instead
public class WorkerController : ApiControllerBase
{
    private readonly IDetectionService _detection;
    private readonly IPreviewService _preview;
    private readonly IConfiguration _config;

    public WorkerController(IDetectionService detection, IPreviewService preview, IConfiguration config)
    {
        _detection = detection;
        _preview = preview;
        _config = config;
    }

    // GET /api/v1/worker/get-jobs  -> the walls to watch right now
    [HttpGet("get-jobs")]
    public async Task<IActionResult> GetJobs()
    {
        if (!KeyIsValid())
            return Problem(statusCode: 401, title: "Missing or wrong worker key");

        return Ok(await _detection.ListJobsAsync());
    }

    // POST /api/v1/worker/send-frame?wallId=...
    // multipart/form-data: frame (JPEG file), frameIndex, timestampSeconds. Same answer as detection/send-frame.
    [HttpPost("send-frame")]
    public async Task<IActionResult> SendFrame(Guid wallId, [FromForm] DetectionFrameRequest request)
    {
        if (!KeyIsValid())
            return Problem(statusCode: 401, title: "Missing or wrong worker key");

        using var buffer = new MemoryStream();
        await request.Frame.CopyToAsync(buffer);

        return FromResult(await _detection.WorkerFrameAsync(
            wallId, buffer.ToArray(), request.FrameIndex, request.TimestampSeconds));
    }

    // POST /api/v1/worker/post-preview?wallId=...
    // multipart/form-data: frame (a JPEG file): the camera picture with the people the model found drawn on it.
    // The apps watch it at detection/preview. 204 = stored, 400 = not a JPEG or too big.
    [HttpPost("post-preview")]
    [RequestSizeLimit(3 * 1024 * 1024)]
    public async Task<IActionResult> PostPreview(Guid wallId, [FromForm] DetectionFrameRequest request)
    {
        if (!KeyIsValid())
            return Problem(statusCode: 401, title: "Missing or wrong worker key");

        using var buffer = new MemoryStream();
        await request.Frame.CopyToAsync(buffer);

        return _preview.Publish(wallId, buffer.ToArray())
            ? NoContent()
            : Problem(statusCode: 400, title: "The preview must be a JPEG picture of at most 2 MB");
    }

    private bool KeyIsValid()
    {
        var expected = _config["Worker:ApiKey"];
        var given = Request.Headers["X-Worker-Key"].ToString();

        // No key configured (or the example's "CHANGE-ME" placeholder still in place) = the worker endpoints are closed to
        // everybody. A placeholder must never work as a real key.
        if (string.IsNullOrEmpty(expected) || expected.StartsWith("CHANGE-ME") || given.Length == 0)
            return false;

        // Fixed-time comparison: it takes the same time whether the first or the last character differs.
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(given));
    }
}
