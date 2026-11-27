using System.Text.Json;
using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

public class WallCellService : IWallCellService
{
    private readonly AppDbContext _db;

    public WallCellService(AppDbContext db)
    {
        _db = db;
    }

    // The list sent is the full truth: cells in the list are added or updated (matched by label,
    // so a cell keeps its id and its laser route), cells missing from the list are deleted.
    public async Task<Result<List<WallCellResponse>>> SaveCellsAsync(
        Guid adminId, Guid propertyId, Guid wallId, List<WallCellRequest> cells)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<List<WallCellResponse>>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.LaserGrid)
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<List<WallCellResponse>>.NotFound("Wall not found");

        var problem = Validate(cells);
        if (problem is not null)
            return Result<List<WallCellResponse>>.BadRequest(problem);

        for (var i = 0; i < cells.Count; i++)
        {
            var request = cells[i];
            var label = request.Label.Trim();

            var cell = wall.Cells.FirstOrDefault(c => c.Label.Equals(label, StringComparison.OrdinalIgnoreCase));
            if (cell is null)
            {
                // No Id here on purpose: an entity added through a tracked navigation with a key already
                // set is assumed to exist (EF would send an UPDATE). With no key, EF generates one and INSERTs.
                cell = new WallCell { WallId = wall.Id };
                wall.Cells.Add(cell);
            }

            cell.Label = label;
            cell.Position = i;
            cell.LengthMeters = request.LengthMeters;
            cell.CornersJson = JsonSerializer.Serialize(new[]
            {
                request.TopLeft, request.BottomLeft, request.TopRight, request.BottomRight
            });
        }

        var keep = cells.Select(c => c.Label.Trim().ToLowerInvariant()).ToHashSet();
        foreach (var gone in wall.Cells.Where(c => !keep.Contains(c.Label.ToLowerInvariant())).ToList())
        {
            wall.Cells.Remove(gone);
            _db.WallCells.Remove(gone);   // its route squares go with it (cascade)
        }

        await _db.SaveChangesAsync();
        return Result<List<WallCellResponse>>.Ok(ToResponses(wall.Cells, SquareSize(wall)));
    }

    public async Task<Result<WallCellResponse>> SetRouteAsync(
        Guid adminId, Guid propertyId, Guid wallId, Guid cellId, List<GridSquareDto> squares)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<WallCellResponse>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.LaserGrid)
            .Include(w => w.Cells)
            .FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<WallCellResponse>.NotFound("Wall not found");

        var cell = wall.Cells.FirstOrDefault(c => c.Id == cellId);
        if (cell is null)
            return Result<WallCellResponse>.NotFound("Cell not found");

        var grid = wall.LaserGrid;
        if (grid is null)
            return Result<WallCellResponse>.BadRequest("Select a laser grid for this wall first");

        foreach (var s in squares)
        {
            if (s.Row >= grid.Rows || s.Col >= grid.Columns)
                return Result<WallCellResponse>.BadRequest(
                    $"Square ({s.Row},{s.Col}) is outside the {grid.Rows} x {grid.Columns} laser grid");
        }

        if (squares.Select(s => (s.Row, s.Col)).Distinct().Count() != squares.Count)
            return Result<WallCellResponse>.BadRequest("A square appears twice in this route");

        // A square may belong to only one cell, on any wall that uses this grid.
        var taken = await _db.WallCellSquares
            .Where(s => s.LaserGridId == grid.Id && s.WallCellId != cellId)
            .Select(s => new { s.Row, s.Col, Cell = s.WallCell.Label, Wall = s.WallCell.Wall.Name })
            .ToListAsync();
        var clash = taken.FirstOrDefault(t => squares.Any(s => s.Row == t.Row && s.Col == t.Col));
        if (clash is not null)
            return Result<WallCellResponse>.Conflict(
                $"Square ({clash.Row},{clash.Col}) is already linked to cell {clash.Cell} of {clash.Wall}");

        // Replace the old route: delete, then insert, in one transaction. Two steps because a square
        // that stays in the route would otherwise hit the unique index while its old row still exists.
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.WallCellSquares.Where(s => s.WallCellId == cellId).ExecuteDeleteAsync();

        var order = 0;
        _db.WallCellSquares.AddRange(squares.Select(s => new WallCellSquare
        {
            WallCellId = cellId,
            LaserGridId = grid.Id,
            Order = order++,
            Row = s.Row,
            Col = s.Col
        }));
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        await _db.Entry(cell).Collection(c => c.Squares).LoadAsync();
        var response = ToResponses(wall.Cells, grid.SquareSizeMeters).First(r => r.Id == cellId);
        return Result<WallCellResponse>.Ok(response);
    }

    public async Task<Result<WallValidationResponse>> ValidateAsync(
        Guid userId, string role, Guid propertyId, Guid wallId)
    {
        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<WallValidationResponse>.NotFound("Property not found");

        var wall = await _db.Walls
            .Include(w => w.Cells).ThenInclude(c => c.Squares)
            .FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<WallValidationResponse>.NotFound("Wall not found");

        var problems = new List<string>();

        if (wall.Cells.Count == 0)
            problems.Add("The wall has no cells");
        if (wall.LaserGridId is null)
            problems.Add("No laser grid is selected for this wall");
        if (wall.CameraGridRow is null)
            problems.Add("The camera position on the laser grid is not set");

        foreach (var cell in wall.Cells.OrderBy(c => c.Position).Where(c => c.Squares.Count == 0))
            problems.Add($"Cell {cell.Label} has no laser route");

        return Result<WallValidationResponse>.Ok(new WallValidationResponse
        {
            Status = problems.Count == 0 ? "Valid" : "Invalid",
            Problems = problems
        });
    }

    // ---- helpers ----

    private static double SquareSize(Wall wall) => wall.LaserGrid?.SquareSizeMeters ?? 0;

    private static string? Validate(List<WallCellRequest> cells)
    {
        var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in cells)
        {
            if (string.IsNullOrWhiteSpace(c.Label))
                return "Every cell needs a label";
            if (!labels.Add(c.Label.Trim()))
                return $"Duplicate cell label '{c.Label.Trim()}'";
            if (!(ValidPoint(c.TopLeft) && ValidPoint(c.BottomLeft) && ValidPoint(c.TopRight) && ValidPoint(c.BottomRight)))
                return $"Cell '{c.Label.Trim()}': every corner must be [x, y] with values from 0 to 1";
        }
        return null;
    }

    private static bool ValidPoint(double[]? p) => p is { Length: 2 } && p.All(v => v >= 0 && v <= 1);

    // Public so WallService can reuse it when it returns a wall with its cells.
    // squareSizeMeters is the size of the wall's laser grid (0 when no grid is chosen yet).
    public static List<WallCellResponse> ToResponses(IEnumerable<WallCell> cells, double squareSizeMeters)
    {
        var list = new List<WallCellResponse>();
        double start = 0;

        foreach (var c in cells.OrderBy(c => c.Position))
        {
            var corners = JsonSerializer.Deserialize<double[][]>(c.CornersJson)!;
            var route = c.Squares.OrderBy(s => s.Order)
                .Select(s => new GridSquareDto { Row = s.Row, Col = s.Col })
                .ToList();

            list.Add(new WallCellResponse
            {
                Id = c.Id,
                Label = c.Label,
                Position = c.Position,
                LengthMeters = c.LengthMeters,
                StartMeters = start,
                EndMeters = start + c.LengthMeters,
                TopLeft = corners[0],
                BottomLeft = corners[1],
                TopRight = corners[2],
                BottomRight = corners[3],
                Route = route,
                LaserCoverageMeters = route.Count * squareSizeMeters
            });
            start += c.LengthMeters;
        }

        return list;
    }
}
