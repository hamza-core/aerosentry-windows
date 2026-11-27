namespace AeroSentry.Api.Data.Entities;

// Join table: one row = "this guard works at this property".
// A guard can have many rows (several properties); a property can have many guards.
public class PropertyGuard
{
    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public Guid GuardId { get; set; }
    public User Guard { get; set; } = null!;

    public DateTime AssignedAtUtc { get; set; } = DateTime.UtcNow;
}
