namespace AeroSentry.Api.DTOs;

public class PropertyResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; } = string.Empty;

    public string? Note {get; set;}
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
