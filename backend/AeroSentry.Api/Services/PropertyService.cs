using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// Admins work with properties they own. Guards can only read properties they are assigned to.
// "Not yours" and "does not exist" look the same to the caller (null/false -> 404),
// so ids cannot be probed.
public class PropertyService
{
    private readonly AppDbContext _db;

    public PropertyService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<PropertyResponse> CreateAsync(Guid adminId, PropertyRequest request)
    {
        var property = new Property
        {
            Id = Guid.NewGuid(),
            OwnerAdminId = adminId,
            Name = request.Name.Trim(),
            Address = request.Address.Trim(),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            Note = request.Note?.Trim()
            
        };

        _db.Properties.Add(property);
        await _db.SaveChangesAsync();

        return ToResponse(property , "Admin");
    }

    // Admin: properties I own. Guard: properties I am assigned to.
    public async Task<List<PropertyResponse>> ListAsync(Guid userId, string role, string? search = null)
    {
        // A query, not data yet: nothing runs in the database until ToListAsync().
        var query = VisibleTo(userId, role);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();

            // A guard never sees the address, so a guard must not be able to search by it either:
            // otherwise they could find an address by guessing it letter by letter.
            query = role == "Admin"
                ? query.Where(p => p.Name.ToLower().Contains(term) || p.Address.ToLower().Contains(term))
                : query.Where(p => p.Name.ToLower().Contains(term));
        }

        // The filter and the sort both run in SQL Server; the query is executed once.
        var properties = await query.OrderBy(p => p.Name).ToListAsync();

        return properties.Select(p => ToResponse(p, role)).ToList();
    }

    public async Task<PropertyResponse?> GetAsync(Guid userId, string role, Guid id)
    {
        var property = await VisibleTo(userId, role).FirstOrDefaultAsync(p => p.Id == id);
       
        return property is null ? null :  ToResponse(property , role);
    }

    public async Task<PropertyResponse?> UpdateAsync(Guid adminId, Guid id, PropertyRequest request)
    {
        var property = await _db.Properties.FirstOrDefaultAsync(p => p.Id == id && p.OwnerAdminId == adminId);
        if (property is null)
            return null;

        property.Name = request.Name.Trim();
        property.Address = request.Address.Trim();
        property.Latitude = request.Latitude;
        property.Longitude = request.Longitude;
        property.Note = request.Note?.Trim();
        await _db.SaveChangesAsync();

        return ToResponse(property , "Admin");
    }

    public async Task<bool> DeleteAsync(Guid adminId, Guid id)
    {
        var property = await _db.Properties.FirstOrDefaultAsync(p => p.Id == id && p.OwnerAdminId == adminId);
        if (property is null)
            return false;

        _db.Properties.Remove(property);   // its PropertyGuard rows go with it (cascade)
        await _db.SaveChangesAsync();
        return true;
    }

    // ---- guard assignment (Admin only) ----

    // Returns null when the property is not this admin's.
    public async Task<List<GuardResponse>?> ListGuardsAsync(Guid adminId, Guid propertyId)
    {
        if (!await _db.Properties.AnyAsync(p => p.Id == propertyId && p.OwnerAdminId == adminId))
            return null;

        var guards = await _db.PropertyGuards
            .Where(pg => pg.PropertyId == propertyId)
            .Select(pg => pg.Guard)
            .OrderBy(g => g.FullName)
            .ToListAsync();

        return guards.Select(GuardService.ToResponse).ToList();
    }

    // false = the property or the guard is not this admin's. Assigning twice is harmless.
    public async Task<bool> AssignGuardAsync(Guid adminId, Guid propertyId, Guid guardId)
    {
        var propertyOk = await _db.Properties.AnyAsync(p => p.Id == propertyId && p.OwnerAdminId == adminId);
        var guardOk = await _db.Users.AnyAsync(
            u => u.Id == guardId && u.Role == "Guard" && u.OwnerAdminId == adminId);
        if (!propertyOk || !guardOk)
            return false;

        var already = await _db.PropertyGuards.AnyAsync(
            pg => pg.PropertyId == propertyId && pg.GuardId == guardId);
        if (!already)
        {
            _db.PropertyGuards.Add(new PropertyGuard { PropertyId = propertyId, GuardId = guardId });
            await _db.SaveChangesAsync();
        }
        return true;
    }

    // false = the property is not this admin's. Removing a missing assignment is harmless.
    public async Task<bool> UnassignGuardAsync(Guid adminId, Guid propertyId, Guid guardId)
    {
        if (!await _db.Properties.AnyAsync(p => p.Id == propertyId && p.OwnerAdminId == adminId))
            return false;

        var link = await _db.PropertyGuards.FirstOrDefaultAsync(
            pg => pg.PropertyId == propertyId && pg.GuardId == guardId);
        if (link is not null)
        {
            _db.PropertyGuards.Remove(link);
            await _db.SaveChangesAsync();
        }
        return true;
    }

    // The one place that decides who may see which property.
    private IQueryable<Property> VisibleTo(Guid userId, string role)
    {
        return role == "Admin"
            ? _db.Properties.Where(p => p.OwnerAdminId == userId)
            : _db.Properties.Where(p => p.PropertyGuards.Any(pg => pg.GuardId == userId));
    }

    private static PropertyResponse ToResponse(Property p , string role ) => new()
    {
        Id = p.Id,
        Name = p.Name,
        Address = role=="Admin" ? p.Address : null,
        Latitude = p.Latitude,
        Longitude = p.Longitude,
        CreatedAtUtc = p.CreatedAtUtc,
        Note = p.Note
    };
}
