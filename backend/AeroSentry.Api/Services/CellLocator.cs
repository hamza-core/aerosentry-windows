using System.Text.Json;
using AeroSentry.Api.Data.Entities;

namespace AeroSentry.Api.Services;

// Decides which wall cell a point is in. The point is a person's foot point:
// the bottom-centre of the bounding box the ML service reports.
public static class CellLocator
{
    // A person box is [left, top, right, bottom]. On the Apple graphics chip the person finder sometimes returns a box that is
    // inside out (left of the right edge or top below the bottom, or no size at all). Its "feet" are then in a wrong place,
    // so such a box must not choose a cell. The model still gets its own input unchanged: it was trained with these boxes.
    public static bool IsUsableBox(double[] box) => box is { Length: 4 } && box[0] < box[2] && box[1] < box[3];

    // Which cell does a point belong to? Two steps, plain geometry only:
    //   1. The first cell (in wall order) whose DRAWN shape contains the point.
    //   2. Otherwise by WALL SECTION. A cell stands for a stretch of the wall, but it is often drawn only where the laser
    //      grid is (for example above the wall) while the person's feet are lower, on the wall or the ground. So the cell's
    //      left and right sides are extended up and down, and the section the point lies in wins. Nothing extra is drawn or
    //      stored: the apps keep showing the cells exactly as they were drawn.
    // Null = the point is past the ends of every section.
    public static WallCell? Find(IEnumerable<WallCell> cells, double x, double y)
    {
        // Stored order of the corners: top-left, bottom-left, top-right, bottom-right.
        var ordered = cells.OrderBy(c => c.Position)
            .Select(cell => (Cell: cell, Corners: JsonSerializer.Deserialize<double[][]>(cell.CornersJson)!))
            .ToList();

        foreach (var (cell, c) in ordered)
        {
            // Walk around the edge: top-left -> top-right -> bottom-right -> bottom-left.
            var polygon = new[] { c[0], c[2], c[3], c[1] };

            if (OnEdge(polygon, x, y) || Contains(polygon, x, y))
                return cell;
        }

        // Best section: the smallest distance outside it (0 = inside), then the cell drawn nearest in height (cells drawn one
        // above another share a section), then the one whose middle is nearest.
        return ordered
            .Select(o => (o.Cell, o.Corners, Section: SectionAt(o.Corners, y)))
            .Where(o => o.Section is not null)
            .Select(o => (o.Cell,
                Outside: Math.Max(0, Math.Max(o.Section!.Value.Left - x, x - o.Section.Value.Right)),
                HeightGap: Math.Max(0, Math.Max(o.Corners.Min(p => p[1]) - y, y - o.Corners.Max(p => p[1]))),
                FromMiddle: Math.Abs(x - (o.Section.Value.Left + o.Section.Value.Right) / 2)))
            .Where(o => o.Outside <= SectionGap)
            .OrderBy(o => o.Outside).ThenBy(o => o.HeightGap).ThenBy(o => o.FromMiddle)
            .Select(o => o.Cell)
            .FirstOrDefault();
    }

    // Cells tapped by hand rarely meet exactly. This much outside a section (2% of the picture's width) still counts.
    private const double SectionGap = 0.02;

    // The left and right limit of a cell's section at height y, or null when the cell cannot be extended there.
    private static (double Left, double Right)? SectionAt(double[][] c, double y)
    {
        var left = SideAt(c[0], c[1], y);
        var right = SideAt(c[2], c[3], y);
        return left < right ? (left.Value, right.Value) : null;       // also null when a side is null, or the two lines have crossed
    }

    // Where the straight line through a side's two corners is at height y. A side that runs more sideways than up and down
    // (a wall going away from the camera can look like that) cannot be extended up and down: null.
    private static double? SideAt(double[] top, double[] bottom, double y)
    {
        double dx = bottom[0] - top[0], dy = bottom[1] - top[1];
        return Math.Abs(dx) < Math.Abs(dy) ? top[0] + dx * (y - top[1]) / dy : null;
    }

    // How close to a cell's edge still counts as inside: half a percent of the picture.
    private const double EdgeTolerance = 0.005;

    // Is the point on the cell's border? This matters: when a person's feet reach the bottom of the picture their box ends at
    // exactly y = 1.0, on the edge of a cell drawn down to the border, and ray casting (below) calls such a point outside.
    // Where two cells share an edge, the first cell in wall order wins.
    private static bool OnEdge(double[][] polygon, double x, double y)
    {
        for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
        {
            double ax = polygon[j][0], ay = polygon[j][1];
            double dx = polygon[i][0] - ax, dy = polygon[i][1] - ay;
            var length = dx * dx + dy * dy;
            // The nearest point of this edge, then the distance to it.
            var t = length == 0 ? 0 : Math.Clamp(((x - ax) * dx + (y - ay) * dy) / length, 0, 1);
            double px = x - (ax + t * dx), py = y - (ay + t * dy);
            if (px * px + py * py <= EdgeTolerance * EdgeTolerance)
                return true;
        }
        return false;
    }

    // Ray casting: shoot a line to the right of the point and count how many polygon edges it crosses.
    // An odd count means the point is inside.
    private static bool Contains(double[][] polygon, double x, double y)
    {
        var inside = false;
        for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
        {
            double xi = polygon[i][0], yi = polygon[i][1];
            double xj = polygon[j][0], yj = polygon[j][1];

            var edgeCrossesRow = (yi > y) != (yj > y);
            if (edgeCrossesRow && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
                inside = !inside;
        }
        return inside;
    }
}
