namespace AeroSentry.Api.Data.Entities;

// One marked area of a wall ("A1", "A2", ...). The intruder's foot point is tested against
// the 4 corners to decide which cell the person is in.
public class WallCell
{
    public Guid Id { get; set; }

    public Guid WallId { get; set; }
    public Wall Wall { get; set; } = null!;

    public string Label { get; set; } = string.Empty;

    // Order along the wall. Start/end metres are worked out from this order and the lengths.
    public int Position { get; set; }

    // Real length of this cell along the wall, measured on site.
    public double LengthMeters { get; set; }

    // JSON text: 4 points [x, y] (0-1) in the order top-left, bottom-left, top-right, bottom-right.
    public string CornersJson { get; set; } = "[]";

    // The laser route of this cell (empty until the admin links it).
    public List<WallCellSquare> Squares { get; set; } = new();
}
