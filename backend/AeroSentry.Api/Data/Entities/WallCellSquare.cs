namespace AeroSentry.Api.Data.Entities;

// One laser-grid square in the route of a wall cell. Order is the visiting order of the drone
// (Order 0 is its first target). A square can belong to only one cell: the database enforces it.
public class WallCellSquare
{
    public Guid Id { get; set; }

    public Guid WallCellId { get; set; }
    public WallCell WallCell { get; set; } = null!;

    public Guid LaserGridId { get; set; }
    public LaserGrid LaserGrid { get; set; } = null!;

    public int Order { get; set; }
    public int Row { get; set; }
    public int Col { get; set; }
}
