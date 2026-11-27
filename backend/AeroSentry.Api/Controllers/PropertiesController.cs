using System.Security.Claims;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

// Naming rule for every controller: /api/v1/<feature>/<action>.
// Ids always go in the query string (?propertyId=...), the JSON body holds only data.
[ApiController]
[Route("api/v1/properties")]
[Authorize]   // any signed-in user; write actions below add Roles = "Admin"
public class PropertiesController : ControllerBase
{
    private readonly PropertyService _properties;

    public PropertiesController(PropertyService properties)
    {
        _properties = properties;
    }

    private Guid CallerId => Guid.Parse(User.FindFirstValue("sub")!);
    private string CallerRole => User.FindFirstValue("role")!;

    // Latitude and longitude must come together or not at all.
    private bool CoordinatesIncomplete(PropertyRequest r) => (r.Latitude is null) != (r.Longitude is null);

    // POST /api/v1/properties/create
    [HttpPost("create")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(PropertyRequest request)
    {
        if (CoordinatesIncomplete(request))
            return Problem(statusCode: 400, title: "Send both latitude and longitude, or neither");

        var result = await _properties.CreateAsync(CallerId, request);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    // GET /api/v1/properties/list
    [HttpGet("list")]
    public async Task<IActionResult> List(string? search)
    {
        return Ok(await _properties.ListAsync(CallerId, CallerRole , search));
    }

    // GET /api/v1/properties/get?propertyId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid propertyId)
    {
        var result = await _properties.GetAsync(CallerId, CallerRole, propertyId);
        if (result is null)
            return Problem(statusCode: 404, title: "Property not found");

        return Ok(result);
    }

    // PUT /api/v1/properties/update?propertyId=...
    [HttpPut("update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(Guid propertyId, PropertyRequest request)
    {
        if (CoordinatesIncomplete(request))
            return Problem(statusCode: 400, title: "Send both latitude and longitude, or neither");

        var result = await _properties.UpdateAsync(CallerId, propertyId, request);
        if (result is null)
            return Problem(statusCode: 404, title: "Property not found");

        return Ok(result);
    }

    // DELETE /api/v1/properties/delete?propertyId=...
    [HttpDelete("delete")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid propertyId)
    {
        if (!await _properties.DeleteAsync(CallerId, propertyId))
            return Problem(statusCode: 404, title: "Property not found");

        return NoContent();
    }

    // ---- which guards work at this property ----

    // GET /api/v1/properties/list-guards?propertyId=...
    [HttpGet("list-guards")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ListGuards(Guid propertyId)
    {
        var result = await _properties.ListGuardsAsync(CallerId, propertyId);
        if (result is null)
            return Problem(statusCode: 404, title: "Property not found");

        return Ok(result);
    }

    // PUT /api/v1/properties/assign-guard?propertyId=...&guardId=...
    [HttpPut("assign-guard")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AssignGuard(Guid propertyId, Guid guardId)
    {
        if (!await _properties.AssignGuardAsync(CallerId, propertyId, guardId))
            return Problem(statusCode: 404, title: "Property or guard not found");

        return NoContent();
    }

    // DELETE /api/v1/properties/unassign-guard?propertyId=...&guardId=...
    [HttpDelete("unassign-guard")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UnassignGuard(Guid propertyId, Guid guardId)
    {
        if (!await _properties.UnassignGuardAsync(CallerId, propertyId, guardId))
            return Problem(statusCode: 404, title: "Property not found");

        return NoContent();
    }
}
