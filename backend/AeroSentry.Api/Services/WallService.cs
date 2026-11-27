using System.Text.Json;
using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// Admins manage the walls of properties they own; guards can read walls of assigned properties.
public class WallService : IWallService
{
    private readonly AppDbContext _db;
    private readonly IDetectionService _detection;

    public WallService(AppDbContext db, IDetectionService detection)
    {
        _db = db;
        _detection = detection;
    }

    public async Task<Result<List<WallResponse>>> ListAsync(Guid userId, string role, Guid propertyId)
    {
        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<List<WallResponse>>.NotFound("Property not found");

        var walls = await _db.Walls
            .Include(w => w.Camera)
            .Include(w => w.LaserGrid)
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .Where(w => w.PropertyId == propertyId)
            .OrderBy(w => w.Name)
            .ToListAsync();

        return Result<List<WallResponse>>.Ok(walls.Select(ToResponse).ToList());
    }

    public async Task<Result<WallResponse>> GetAsync(Guid userId, string role, Guid propertyId, Guid id)
    {
        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<WallResponse>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.Camera)
            .Include(w => w.LaserGrid)
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .FirstOrDefaultAsync(w => w.Id == id && w.PropertyId == propertyId);

        return wall is null
            ? Result<WallResponse>.NotFound("Wall not found")
            : Result<WallResponse>.Ok(ToResponse(wall));
    }

    public async Task<Result<WallResponse>> CreateAsync(Guid adminId, Guid propertyId, WallRequest request)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<WallResponse>.NotFound("Property not found");

        var problem = await ValidateAsync(propertyId, request);
        if (problem is not null)
            return Result<WallResponse>.BadRequest(problem);

        var name = request.Name.Trim();
        if (await _db.Walls.AnyAsync(w => w.PropertyId == propertyId && w.Name == name))
            return Result<WallResponse>.Conflict("A wall with this name already exists in this property");

        var wall = new Wall { Id = Guid.NewGuid(), PropertyId = propertyId };
        Apply(wall, request);

        _db.Walls.Add(wall);
        await _db.SaveChangesAsync();

        await _db.Entry(wall).Reference(w => w.Camera).LoadAsync();
        return Result<WallResponse>.Ok(ToResponse(wall));
    }

    public async Task<Result<WallResponse>> UpdateAsync(Guid adminId, Guid propertyId, Guid id, WallRequest request)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<WallResponse>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .FirstOrDefaultAsync(w => w.Id == id && w.PropertyId == propertyId);
        if (wall is null)
            return Result<WallResponse>.NotFound("Wall not found");

        var problem = await ValidateAsync(propertyId, request);
        if (problem is not null)
            return Result<WallResponse>.BadRequest(problem);

        var name = request.Name.Trim();
        if (await _db.Walls.AnyAsync(w => w.PropertyId == propertyId && w.Name == name && w.Id != id))
            return Result<WallResponse>.Conflict("A wall with this name already exists in this property");

        // Routes are squares of one specific grid. If the wall moves to another grid (or none),
        // the old routes mean nothing any more, so they are cleared.
        if (wall.LaserGridId != request.LaserGridId)
        {
            foreach (var cell in wall.Cells)
                _db.WallCellSquares.RemoveRange(cell.Squares);
        }

        var annotationChanged = AnnotationChanged(wall, request.FrameWidth, request.FrameHeight,
            request.WallTopPoints, request.WallBottomPoints);

        Apply(wall, request);
        await _db.SaveChangesAsync();

        // The ML service holds the annotation of a running session. A new annotation needs a new session.
        if (annotationChanged)
            await _detection.ResetSessionAsync(wall.Id);

        await _db.Entry(wall).Reference(w => w.Camera).LoadAsync();
        await _db.Entry(wall).Reference(w => w.LaserGrid).LoadAsync();
        return Result<WallResponse>.Ok(ToResponse(wall));
    }

    public async Task<Result<WallResponse>> SaveAnnotationAsync(
        Guid adminId, Guid propertyId, Guid id, WallAnnotationRequest request)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<WallResponse>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.Camera)
            .Include(w => w.LaserGrid)
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .FirstOrDefaultAsync(w => w.Id == id && w.PropertyId == propertyId);
        if (wall is null)
            return Result<WallResponse>.NotFound("Wall not found");

        if (!ValidPoints(request.WallTopPoints))
            return Result<WallResponse>.BadRequest("wallTopPoints must be 2 to 100 points [x, y], each value from 0 to 1");
        if (!ValidPoints(request.WallBottomPoints))
            return Result<WallResponse>.BadRequest("wallBottomPoints must be 2 to 100 points [x, y], each value from 0 to 1");

        var changed = AnnotationChanged(wall, request.FrameWidth, request.FrameHeight,
            request.WallTopPoints, request.WallBottomPoints);

        wall.FrameWidth = request.FrameWidth;
        wall.FrameHeight = request.FrameHeight;
        wall.TopPointsJson = JsonSerializer.Serialize(request.WallTopPoints);
        wall.BottomPointsJson = JsonSerializer.Serialize(request.WallBottomPoints);
        await _db.SaveChangesAsync();

        if (changed)
            await _detection.ResetSessionAsync(wall.Id);

        return Result<WallResponse>.Ok(ToResponse(wall));
    }

    public async Task<Result<bool>> DeleteAsync(Guid adminId, Guid propertyId, Guid id)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<bool>.NotFound("Property not found");

        var wall = await _db.Walls.FirstOrDefaultAsync(w => w.Id == id && w.PropertyId == propertyId);
        if (wall is null)
            return Result<bool>.NotFound("Wall not found");

        _db.Walls.Remove(wall);
        await _db.SaveChangesAsync();
        return Result<bool>.Ok(true);
    }

    // ---- helpers ----

    // Returns a message when the request is wrong, or null when it is fine.
    private async Task<string?> ValidateAsync(Guid propertyId, WallRequest r)
    {
        if (!ValidPoints(r.WallTopPoints))
            return "wallTopPoints must be 2 to 100 points [x, y], each value from 0 to 1";
        if (!ValidPoints(r.WallBottomPoints))
            return "wallBottomPoints must be 2 to 100 points [x, y], each value from 0 to 1";

        if (!await _db.Cameras.AnyAsync(c => c.Id == r.CameraId && c.PropertyId == propertyId))
            return "Camera not found in this property";

        LaserGrid? grid = null;
        if (r.LaserGridId is not null)
        {
            grid = await _db.LaserGrids.FirstOrDefaultAsync(g => g.Id == r.LaserGridId && g.PropertyId == propertyId);
            if (grid is null)
                return "Laser grid not found in this property";
        }

        if ((r.CameraGridRow is null) != (r.CameraGridCol is null))
            return "Send both cameraGridRow and cameraGridCol, or neither";

        if (r.CameraGridRow is not null)
        {
            if (grid is null)
                return "The camera position needs a laserGridId";
            if (r.CameraGridRow < 0 || r.CameraGridRow >= grid.Rows || r.CameraGridCol < 0 || r.CameraGridCol >= grid.Columns)
                return "The camera position is outside the laser grid";
        }

        return null;
    }

    // Did the annotation (picture size or either line) really change? Same serializer on both sides.
    private static bool AnnotationChanged(Wall wall, int frameWidth, int frameHeight, double[][] top, double[][] bottom) =>
        wall.FrameWidth != frameWidth
        || wall.FrameHeight != frameHeight
        || wall.TopPointsJson != JsonSerializer.Serialize(top)
        || wall.BottomPointsJson != JsonSerializer.Serialize(bottom);

    // A wall edge is a line through 2 or more points, in the order they were drawn: a straight wall needs 2, a wall with
    // corners or steps needs more. The model was trained on such lines (up to 100 points is plenty).
    private const int MaxLinePoints = 100;
    private static bool ValidPoints(double[][]? points) =>
        points is { Length: >= 2 and <= MaxLinePoints } && points.All(p => p is { Length: 2 } && p.All(v => v >= 0 && v <= 1));

    private static void Apply(Wall wall, WallRequest r)
    {
        wall.Name = r.Name.Trim();
        wall.CameraId = r.CameraId;
        wall.FrameWidth = r.FrameWidth;
        wall.FrameHeight = r.FrameHeight;
        wall.TopPointsJson = JsonSerializer.Serialize(r.WallTopPoints);
        wall.BottomPointsJson = JsonSerializer.Serialize(r.WallBottomPoints);
        wall.LaserGridId = r.LaserGridId;
        wall.CameraGridRow = r.CameraGridRow;
        wall.CameraGridCol = r.CameraGridCol;
    }

    private static WallResponse ToResponse(Wall w) => new()
    {
        Id = w.Id,
        PropertyId = w.PropertyId,
        Name = w.Name,
        CameraId = w.CameraId,
        CameraName = w.Camera.Name,
        FrameWidth = w.FrameWidth,
        FrameHeight = w.FrameHeight,
        WallTopPoints = JsonSerializer.Deserialize<double[][]>(w.TopPointsJson)!,
        WallBottomPoints = JsonSerializer.Deserialize<double[][]>(w.BottomPointsJson)!,
        LaserGridId = w.LaserGridId,
        CameraGridRow = w.CameraGridRow,
        CameraGridCol = w.CameraGridCol,
        CreatedAtUtc = w.CreatedAtUtc,
        DetectionEnabled = w.DetectionEnabled,
        TotalLengthMeters = w.Cells.Sum(c => c.LengthMeters),
        Cells = WallCellService.ToResponses(w.Cells, w.LaserGrid?.SquareSizeMeters ?? 0)
    };
}
