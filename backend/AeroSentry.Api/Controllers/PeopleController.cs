using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

// Authorized people: faces that are NOT treated as intruders. Faces are biometric data, so every function
// here is for admins only, and only for their own properties.
[Route("api/v1/people")]
[Authorize(Roles = "Admin")]
public class PeopleController : ApiControllerBase
{
    private readonly IPersonService _people;

    public PeopleController(IPersonService people)
    {
        _people = people;
    }

    // POST /api/v1/people/enroll?propertyId=...
    // multipart/form-data: name, category (Resident|Employee|Visitor), optional phone, validUntil (2026-10-31), note,
    // and three picture files: front, left, right (each must show exactly one face).
    [HttpPost("enroll")]
    [RequestSizeLimit(60_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 60_000_000)]
    public async Task<IActionResult> Enroll(Guid propertyId, [FromForm] EnrollPersonRequest request) =>
        FromResult(await _people.EnrollAsync(CallerId, propertyId, request,
            await ReadAsync(request.Front), await ReadAsync(request.Left), await ReadAsync(request.Right)), created: true);

    // POST /api/v1/people/enroll-video?propertyId=...
    // multipart/form-data: name, category (Resident|Employee|Visitor), optional phone, validUntil (2026-10-31), note,
    // and ONE video file (10 to 20 seconds of a person looking straight, left, right, up and down).
    // The face service picks the sharpest frame of each pose and the embeddings; front, left and right are required.
    [HttpPost("enroll-video")]
    [RequestSizeLimit(110_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110_000_000)]
    public async Task<IActionResult> EnrollVideo(Guid propertyId, [FromForm] EnrollPersonVideoRequest request) =>
        FromResult(await _people.EnrollFromVideoAsync(CallerId, propertyId, request, await ReadAsync(request.Video)), created: true);

    // POST /api/v1/people/enroll-frames?propertyId=...
    // multipart/form-data: the same fields as enroll-video. ONE video of about 20 seconds of one person facing the camera.
    // Like the learning script enroll_user.py: a frame about every 0.4 s, 30 frames with one face wider than 100 px,
    // and the face profile is the average of the 30.
    [HttpPost("enroll-frames")]
    [RequestSizeLimit(110_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 110_000_000)]
    public async Task<IActionResult> EnrollFrames(Guid propertyId, [FromForm] EnrollPersonVideoRequest request) =>
        FromResult(await _people.EnrollFromFramesAsync(CallerId, propertyId, request, await ReadAsync(request.Video)), created: true);

    // POST /api/v1/people/check-frame?propertyId=...      multipart: image   (the live capture screen, a few times a second)
    [HttpPost("check-frame")]
    public async Task<IActionResult> CheckFrame(Guid propertyId, IFormFile image) =>
        FromResult(await _people.CheckFrameAsync(CallerId, propertyId, (await ReadAsync(image)).Bytes));

    // POST /api/v1/people/enroll-captured?propertyId=...
    // multipart: name, category, optional phone, validUntil, note, and 30 to 60 files named "frames".
    [HttpPost("enroll-captured")]
    [RequestSizeLimit(60_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 60_000_000)]
    public async Task<IActionResult> EnrollCaptured(Guid propertyId, [FromForm] EnrollPersonImagesRequest request)
    {
        var images = new List<PhotoUpload>();
        foreach (var file in request.Frames.Take(61))
            images.Add(await ReadAsync(file));
        return FromResult(await _people.EnrollFromImagesAsync(CallerId, propertyId, request, images), created: true);
    }

    // POST /api/v1/people/check-photo?propertyId=...      multipart: image
    // Is this picture good enough to enrol with? The app can call it for each tile as the photo is taken.
    [HttpPost("check-photo")]
    public async Task<IActionResult> CheckPhoto(Guid propertyId, IFormFile image) =>
        FromResult(await _people.CheckPhotoAsync(CallerId, propertyId, (await ReadAsync(image)).Bytes));

    // GET /api/v1/people/list?propertyId=...[&category=Resident|Employee|Visitor]
    [HttpGet("list")]
    public async Task<IActionResult> List(Guid propertyId, string? category) =>
        FromResult(await _people.ListAsync(CallerId, propertyId, category));

    // GET /api/v1/people/get?propertyId=...&personId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid propertyId, Guid personId) =>
        FromResult(await _people.GetAsync(CallerId, propertyId, personId));

    // GET /api/v1/people/get-photo?propertyId=...&personId=...&angle=Front|Left|Right      the picture itself
    [HttpGet("get-photo")]
    public async Task<IActionResult> GetPhoto(Guid propertyId, Guid personId, string angle)
    {
        var result = await _people.GetPhotoAsync(CallerId, propertyId, personId, angle);
        return result.Status == ResultStatus.Success ? File(result.Value!.Bytes, result.Value.ContentType) : FromResult(result);
    }

    // PUT /api/v1/people/update?propertyId=...&personId=...      JSON: name, phone, category, validUntil, note
    [HttpPut("update")]
    public async Task<IActionResult> Update(Guid propertyId, Guid personId, UpdatePersonRequest request) =>
        FromResult(await _people.UpdateAsync(CallerId, propertyId, personId, request));

    // POST /api/v1/people/disable-access?propertyId=...&personId=...      the person stays, but is no longer authorized
    [HttpPost("disable-access")]
    public async Task<IActionResult> DisableAccess(Guid propertyId, Guid personId) =>
        FromResult(await _people.SetAccessAsync(CallerId, propertyId, personId, disabled: true));

    // POST /api/v1/people/enable-access?propertyId=...&personId=...
    [HttpPost("enable-access")]
    public async Task<IActionResult> EnableAccess(Guid propertyId, Guid personId) =>
        FromResult(await _people.SetAccessAsync(CallerId, propertyId, personId, disabled: false));

    // DELETE /api/v1/people/delete?propertyId=...&personId=...      removes the person, the photos and the face numbers for good
    [HttpDelete("delete")]
    public async Task<IActionResult> Delete(Guid propertyId, Guid personId) =>
        NoContentFromResult(await _people.DeleteAsync(CallerId, propertyId, personId));

    // POST /api/v1/people/identify?propertyId=...      multipart: image
    // Who is in this picture? Every face with its best match among the enrolled people.
    [HttpPost("identify")]
    public async Task<IActionResult> Identify(Guid propertyId, IFormFile image) =>
        FromResult(await _people.IdentifyAsync(CallerId, propertyId, (await ReadAsync(image)).Bytes));

    private static async Task<PhotoUpload> ReadAsync(IFormFile file)
    {
        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer);
        return new PhotoUpload(buffer.ToArray(), file.ContentType);
    }
}
