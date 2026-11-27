using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/cameras")]
public class CamerasController : ApiControllerBase
{
    private readonly ICameraService _cameras;

    public CamerasController(ICameraService cameras)
    {
        _cameras = cameras;
    }

    // POST /api/v1/cameras/create?propertyId=...
    [HttpPost("create")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(Guid propertyId, CameraRequest request)
    {
        var result = await _cameras.CreateAsync(CallerId, propertyId, request);
        return ToActionResult(result, created: true);
    }

    // GET /api/v1/cameras/list?propertyId=...
    [HttpGet("list")]
    public async Task<IActionResult> List(Guid propertyId)
    {
        var result = await _cameras.ListAsync(CallerId, CallerRole, propertyId);
        if (result is null)
            return Problem(statusCode: 404, title: "Property not found");

        return Ok(result);
    }

    // GET /api/v1/cameras/get?propertyId=...&cameraId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid propertyId, Guid cameraId)
    {
        var result = await _cameras.GetAsync(CallerId, CallerRole, propertyId, cameraId);
        if (result is null)
            return Problem(statusCode: 404, title: "Camera not found");

        return Ok(result);
    }

    // PUT /api/v1/cameras/update?propertyId=...&cameraId=...
    [HttpPut("update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(Guid propertyId, Guid cameraId, CameraRequest request)
    {
        var result = await _cameras.UpdateAsync(CallerId, propertyId, cameraId, request);
        return ToActionResult(result, created: false);
    }

    // DELETE /api/v1/cameras/delete?propertyId=...&cameraId=...
    [HttpDelete("delete")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid propertyId, Guid cameraId) =>
        NoContentFromResult(await _cameras.DeleteAsync(CallerId, propertyId, cameraId));

    // POST /api/v1/cameras/test-connection?propertyId=...   (nothing is saved)
    [HttpPost("test-connection")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> TestConnection(Guid propertyId, CameraRequest request)
    {
        var result = await _cameras.TestAsync(CallerId, propertyId, request);
        if (result is null)
            return Problem(statusCode: 404, title: "Property not found");

        return Ok(result);
    }

    // GET /api/v1/cameras/get-snapshot?propertyId=...&cameraId=...      (Admin)
    // Answers with the picture itself (image/jpeg). Its size is in the headers X-Frame-Width and X-Frame-Height:
    // send those as frameWidth / frameHeight when you save the annotation (walls/save-annotation).
    [HttpGet("get-snapshot")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetSnapshot(Guid propertyId, Guid cameraId)
    {
        var result = await _cameras.GetSnapshotAsync(CallerId, propertyId, cameraId);
        if (result.Status != ResultStatus.Success)
            return FromResult(result);

        Response.Headers["X-Frame-Width"] = result.Value!.Width.ToString();
        Response.Headers["X-Frame-Height"] = result.Value.Height.ToString();
        return File(result.Value.Image, "image/jpeg");
    }

    private IActionResult ToActionResult(CameraResult result, bool created)
    {
        return result.Status switch
        {
            CameraStatus.NotFound => Problem(statusCode: 404, title: "Property or camera not found"),
            CameraStatus.DuplicateName => Problem(statusCode: 409, title: "A camera with this name already exists in this property"),
            _ => created
                ? StatusCode(StatusCodes.Status201Created, result.Camera)
                : Ok(result.Camera)
        };
    }
}
