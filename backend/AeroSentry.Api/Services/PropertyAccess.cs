using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// The one rule for "who may see a property", shared by every feature that lives inside a property.
public static class PropertyAccess
{
    // Admin: properties I own. Guard: properties I am assigned to.
    public static IQueryable<Property> VisibleProperties(this AppDbContext db, Guid userId, string role)
    {
        return role == "Admin"
            ? db.Properties.Where(p => p.OwnerAdminId == userId)
            : db.Properties.Where(p => p.PropertyGuards.Any(pg => pg.GuardId == userId));
    }

    public static Task<bool> CanSeeProperty(this AppDbContext db, Guid userId, string role, Guid propertyId) =>
        db.VisibleProperties(userId, role).AnyAsync(p => p.Id == propertyId);

    public static Task<bool> OwnsProperty(this AppDbContext db, Guid adminId, Guid propertyId) =>
        db.Properties.AnyAsync(p => p.Id == propertyId && p.OwnerAdminId == adminId);
}
