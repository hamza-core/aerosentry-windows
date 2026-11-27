using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/laser-grids")]
public class LaserGridsController : ApiControllerBase
{
    private readonly ILaserGridService _grids;

    public LaserGridsController(ILaserGridService grids)
    {
        _grids = grids;
    }

    // POST /api/v1/laser-grids/create?propertyId=...
    [HttpPost("create")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(Guid propertyId, LaserGridRequest request) =>
        FromResult(await _grids.CreateAsync(CallerId, propertyId, request), created: true);

    // GET /api/v1/laser-grids/list?propertyId=...
    [HttpGet("list")]
    public async Task<IActionResult> List(Guid propertyId) =>
        FromResult(await _grids.ListAsync(CallerId, CallerRole, propertyId));

    // GET /api/v1/laser-grids/get?propertyId=...&gridId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid propertyId, Guid gridId) =>
        FromResult(await _grids.GetAsync(CallerId, CallerRole, propertyId, gridId));

    // PUT /api/v1/laser-grids/update?propertyId=...&gridId=...
    [HttpPut("update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(Guid propertyId, Guid gridId, LaserGridRequest request) =>
        FromResult(await _grids.UpdateAsync(CallerId, propertyId, gridId, request));

    // DELETE /api/v1/laser-grids/delete?propertyId=...&gridId=...
    [HttpDelete("delete")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid propertyId, Guid gridId) =>
        NoContentFromResult(await _grids.DeleteAsync(CallerId, propertyId, gridId));
}
