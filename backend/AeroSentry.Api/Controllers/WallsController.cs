using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/walls")]
public class WallsController : ApiControllerBase
{
    private readonly IWallService _walls;
    private readonly IWallCellService _cells;

    public WallsController(IWallService walls, IWallCellService cells)
    {
        _walls = walls;
        _cells = cells;
    }

    // ---- the wall itself (camera + annotation + laser grid) ----

    // POST /api/v1/walls/create?propertyId=...
    [HttpPost("create")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(Guid propertyId, WallRequest request) =>
        FromResult(await _walls.CreateAsync(CallerId, propertyId, request), created: true);

    // GET /api/v1/walls/list?propertyId=...
    [HttpGet("list")]
    public async Task<IActionResult> List(Guid propertyId) =>
        FromResult(await _walls.ListAsync(CallerId, CallerRole, propertyId));

    // GET /api/v1/walls/get?propertyId=...&wallId=...
    [HttpGet("get")]
    public async Task<IActionResult> Get(Guid propertyId, Guid wallId) =>
        FromResult(await _walls.GetAsync(CallerId, CallerRole, propertyId, wallId));

    // PUT /api/v1/walls/update?propertyId=...&wallId=...
    [HttpPut("update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(Guid propertyId, Guid wallId, WallRequest request) =>
        FromResult(await _walls.UpdateAsync(CallerId, propertyId, wallId, request));

    // DELETE /api/v1/walls/delete?propertyId=...&wallId=...
    [HttpDelete("delete")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid propertyId, Guid wallId) =>
        NoContentFromResult(await _walls.DeleteAsync(CallerId, propertyId, wallId));

    // PUT /api/v1/walls/save-annotation?propertyId=...&wallId=...      (Admin)
    // Saves only the wall annotation: the admin draws 2 top points and 2 bottom points on a camera picture
    // (get one with cameras/get-snapshot, or capture a frame of the playback stream) and sends them here
    // with the picture's size. A running detection picks the new lines up at once.
    [HttpPut("save-annotation")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SaveAnnotation(Guid propertyId, Guid wallId, WallAnnotationRequest request) =>
        FromResult(await _walls.SaveAnnotationAsync(CallerId, propertyId, wallId, request));

    // ---- cells, laser routes and validation of one wall ----

    // PUT /api/v1/walls/save-cells?propertyId=...&wallId=...    body: the full list of cells
    [HttpPut("save-cells")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SaveCells(Guid propertyId, Guid wallId, List<WallCellRequest> cells) =>
        FromResult(await _cells.SaveCellsAsync(CallerId, propertyId, wallId, cells));

    // PUT /api/v1/walls/set-cell-route?propertyId=...&wallId=...&cellId=...
    // Body: squares in the order the drone should visit them, e.g. [{"row":0,"col":0},{"row":1,"col":0}]
    [HttpPut("set-cell-route")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SetCellRoute(Guid propertyId, Guid wallId, Guid cellId, List<GridSquareDto> squares) =>
        FromResult(await _cells.SetRouteAsync(CallerId, propertyId, wallId, cellId, squares));

    // GET /api/v1/walls/validate?propertyId=...&wallId=...
    [HttpGet("validate")]
    public async Task<IActionResult> Validate(Guid propertyId, Guid wallId) =>
        FromResult(await _cells.ValidateAsync(CallerId, CallerRole, propertyId, wallId));
}
