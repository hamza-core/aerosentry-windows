namespace AeroSentry.Api.DTOs;

public class WallCellResponse
{
    public Guid Id { get; set; }
    public string Label { get; set; } = string.Empty;
    public int Position { get; set; }
    public double LengthMeters { get; set; }

    // Worked out from the order and lengths: A1 0-10 m, A2 10-20 m, ...
    public double StartMeters { get; set; }
    public double EndMeters { get; set; }

    public double[] TopLeft { get; set; } = Array.Empty<double>();
    public double[] BottomLeft { get; set; } = Array.Empty<double>();
    public double[] TopRight { get; set; } = Array.Empty<double>();
    public double[] BottomRight { get; set; } = Array.Empty<double>();

    // Laser squares in drone visiting order, and how far they cover (squares x square size).
    public List<GridSquareDto> Route { get; set; } = new();
    public double LaserCoverageMeters { get; set; }
}
