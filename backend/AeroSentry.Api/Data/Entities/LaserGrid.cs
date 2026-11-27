namespace AeroSentry.Api.Data.Entities;

// An installed laser grid: Rows x Columns squares, each SquareSizeMeters wide.
// The size is chosen by the admin, it is not fixed.
public class LaserGrid
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public int Rows { get; set; }
    public int Columns { get; set; }
    public double SquareSizeMeters { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
