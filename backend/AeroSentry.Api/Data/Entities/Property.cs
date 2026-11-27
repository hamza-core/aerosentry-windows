namespace AeroSentry.Api.Data.Entities;

public class Property
{
    public Guid Id { get; set; }

    // The Admin who owns this property (foreign key to Users).
    public Guid OwnerAdminId { get; set; }
    public User OwnerAdmin { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;

    public string? Note {get; set;}

    // Optional. Normal GPS degrees: latitude -90..90, longitude -180..180.
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Guards assigned to this property (many-to-many through PropertyGuard).
    public List<PropertyGuard> PropertyGuards { get; set; } = new();
}
