using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// Admins manage the laser grids of properties they own; guards can read grids of assigned properties.
public class LaserGridService : ILaserGridService
{
    private readonly AppDbContext _db;

    public LaserGridService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Result<List<LaserGridResponse>>> ListAsync(Guid userId, string role, Guid propertyId)
    {
        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<List<LaserGridResponse>>.NotFound("Property not found");

        var grids = await _db.LaserGrids
            .Where(g => g.PropertyId == propertyId)
            .OrderBy(g => g.Name)
            .ToListAsync();

        return Result<List<LaserGridResponse>>.Ok(grids.Select(ToResponse).ToList());
    }

    public async Task<Result<LaserGridResponse>> GetAsync(Guid userId, string role, Guid propertyId, Guid id)
    {
        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<LaserGridResponse>.NotFound("Property not found");

        var grid = await _db.LaserGrids.FirstOrDefaultAsync(g => g.Id == id && g.PropertyId == propertyId);
        return grid is null
            ? Result<LaserGridResponse>.NotFound("Laser grid not found")
            : Result<LaserGridResponse>.Ok(ToResponse(grid));
    }

    public async Task<Result<LaserGridResponse>> CreateAsync(Guid adminId, Guid propertyId, LaserGridRequest request)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<LaserGridResponse>.NotFound("Property not found");

        var name = request.Name.Trim();
        if (await _db.LaserGrids.AnyAsync(g => g.PropertyId == propertyId && g.Name == name))
            return Result<LaserGridResponse>.Conflict("A laser grid with this name already exists in this property");

        var grid = new LaserGrid { Id = Guid.NewGuid(), PropertyId = propertyId };
        Apply(grid, request);

        _db.LaserGrids.Add(grid);
        await _db.SaveChangesAsync();

        return Result<LaserGridResponse>.Ok(ToResponse(grid));
    }

    public async Task<Result<LaserGridResponse>> UpdateAsync(Guid adminId, Guid propertyId, Guid id, LaserGridRequest request)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<LaserGridResponse>.NotFound("Property not found");

        var grid = await _db.LaserGrids.FirstOrDefaultAsync(g => g.Id == id && g.PropertyId == propertyId);
        if (grid is null)
            return Result<LaserGridResponse>.NotFound("Laser grid not found");

        var name = request.Name.Trim();
        if (await _db.LaserGrids.AnyAsync(g => g.PropertyId == propertyId && g.Name == name && g.Id != id))
            return Result<LaserGridResponse>.Conflict("A laser grid with this name already exists in this property");

        // A smaller grid must not leave a linked square or a camera position outside it.
        var squareOutside = await _db.WallCellSquares.AnyAsync(
            s => s.LaserGridId == id && (s.Row >= request.Rows || s.Col >= request.Columns));
        var cameraOutside = await _db.Walls.AnyAsync(
            w => w.LaserGridId == id && (w.CameraGridRow >= request.Rows || w.CameraGridCol >= request.Columns));
        if (squareOutside || cameraOutside)
            return Result<LaserGridResponse>.Conflict(
                "A linked square or a camera position would be outside the smaller grid");

        Apply(grid, request);
        await _db.SaveChangesAsync();

        return Result<LaserGridResponse>.Ok(ToResponse(grid));
    }

    public async Task<Result<bool>> DeleteAsync(Guid adminId, Guid propertyId, Guid id)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<bool>.NotFound("Property not found");

        var grid = await _db.LaserGrids.FirstOrDefaultAsync(g => g.Id == id && g.PropertyId == propertyId);
        if (grid is null)
            return Result<bool>.NotFound("Laser grid not found");

        if (await _db.Walls.AnyAsync(w => w.LaserGridId == id))
            return Result<bool>.Conflict("This laser grid is used by a wall");

        _db.LaserGrids.Remove(grid);
        await _db.SaveChangesAsync();
        return Result<bool>.Ok(true);
    }

    private static void Apply(LaserGrid grid, LaserGridRequest request)
    {
        grid.Name = request.Name.Trim();
        grid.Rows = request.Rows;
        grid.Columns = request.Columns;
        grid.SquareSizeMeters = request.SquareSizeMeters;
    }

    private static LaserGridResponse ToResponse(LaserGrid g) => new()
    {
        Id = g.Id,
        PropertyId = g.PropertyId,
        Name = g.Name,
        Rows = g.Rows,
        Columns = g.Columns,
        SquareSizeMeters = g.SquareSizeMeters,
        CreatedAtUtc = g.CreatedAtUtc
    };
}
