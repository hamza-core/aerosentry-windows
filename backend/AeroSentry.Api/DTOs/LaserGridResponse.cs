namespace AeroSentry.Api.DTOs;

public class LaserGridResponse
{
    public Guid Id { get; set; }
    public Guid PropertyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Rows { get; set; }
    public int Columns { get; set; }
    public double SquareSizeMeters { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
