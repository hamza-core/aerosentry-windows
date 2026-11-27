namespace AeroSentry.Api.DTOs;

public class WallValidationResponse
{
    // "Valid" or "Invalid"
    public string Status { get; set; } = "Invalid";

    // What is still missing, in plain words. Empty when Status is Valid.
    // (Shared squares cannot exist: the database refuses them when a route is saved.)
    public List<string> Problems { get; set; } = new();
}
