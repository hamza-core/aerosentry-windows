using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

public interface IWallCellService
{
    // Saves the whole list of cells of a wall (the "Save Wall Cells" button).
    Task<Result<List<WallCellResponse>>> SaveCellsAsync(Guid adminId, Guid propertyId, Guid wallId, List<WallCellRequest> cells);

    // Sets the laser route of one cell: squares in the order the drone should visit them.
    Task<Result<WallCellResponse>> SetRouteAsync(Guid adminId, Guid propertyId, Guid wallId, Guid cellId, List<GridSquareDto> squares);

    // Is this wall ready to be used? Computed on request, nothing is stored.
    Task<Result<WallValidationResponse>> ValidateAsync(Guid userId, string role, Guid propertyId, Guid wallId);
}
