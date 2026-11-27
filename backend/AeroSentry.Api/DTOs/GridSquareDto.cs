using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// A square of the laser grid, labelled row,col (row 0 is nearest the wall). Used in requests and responses.
public class GridSquareDto
{
    [Range(0, 49)]
    public int Row { get; set; }

    [Range(0, 49)]
    public int Col { get; set; }
}
