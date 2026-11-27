using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Hubs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// Every method takes adminId (the caller's id from the token) and only touches
// guards whose OwnerAdminId equals it. One admin can never see or change another admin's guards.
public class GuardService
{
    private readonly AppDbContext _db;
    private readonly PasswordHasher<User> _hasher = new();
    private readonly ConnectionTracker _connections;

    public GuardService(AppDbContext db, ConnectionTracker connections)
    {
        _db = db;
        _connections = connections;
    }

    // Returns null when the email is already taken.
    public async Task<GuardResponse?> CreateAsync(Guid adminId, RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _db.Users.AnyAsync(u => u.Email == email))
            return null;

        var guard = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Email = email,
            PhoneNumber = request.PhoneNumber,
            Role = "Guard",
            OwnerAdminId = adminId
        };
        guard.PasswordHash = _hasher.HashPassword(guard, request.Password);

        _db.Users.Add(guard);
        await _db.SaveChangesAsync();

        return ToResponse(guard);
    }

    // status: null = everyone, "Active" or "Suspended" = filter (validated in the controller).
    public async Task<List<GuardResponse>> ListAsync(Guid adminId, string? status = null)
    {
        var query = _db.Users.Where(u => u.Role == "Guard" && u.OwnerAdminId == adminId);

        if (status is not null)
        {
            var active = status.Equals("Active", StringComparison.OrdinalIgnoreCase);
            query = query.Where(u => u.IsActive == active);   // runs in SQL, not in memory
        }

        var guards = await query.OrderBy(u => u.FullName).ToListAsync();

        return guards.Select(ToResponse).ToList();
    }

    // Returns null when this admin has no guard with that id.
    public async Task<GuardResponse?> SetStatusAsync(Guid adminId, Guid id, string status)
    {
        var guard = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == id && u.Role == "Guard" && u.OwnerAdminId == adminId);
        if (guard is null)
            return null;

        guard.IsActive = status == "Active";
        await _db.SaveChangesAsync();

        // A suspended guard must stop receiving live alerts NOW, not at their next reconnect.
        if (!guard.IsActive)
            _connections.Disconnect(guard.Id);

        return ToResponse(guard);
    }

    public async Task<bool> DeleteAsync(Guid adminId, Guid id)
    {
        var guard = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == id && u.Role == "Guard" && u.OwnerAdminId == adminId);
        if (guard is null)
            return false;

        _db.Users.Remove(guard);   // its PropertyGuard rows are removed by the cascade rule
        await _db.SaveChangesAsync();

        _connections.Disconnect(id);
        return true;
    }

    // public so PropertyService can reuse the same mapping.
    public static GuardResponse ToResponse(User u) => new()
    {
        Id = u.Id,
        FullName = u.FullName,
        Email = u.Email,
        Role = u.Role,
        Status = u.IsActive ? "Active" : "Suspended"
    };
}
