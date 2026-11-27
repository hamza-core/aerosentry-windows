using AeroSentry.Api.Data;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

public class PreviewService : IPreviewService
{
    private readonly PreviewStore _store;
    private readonly AppDbContext _db;

    public PreviewService(PreviewStore store, AppDbContext db)
    {
        _store = store;
        _db = db;
    }

    public bool Publish(Guid wallId, byte[] jpeg) => _store.Put(wallId, jpeg);

    public PreviewFrame? Latest(Guid wallId) => _store.Get(wallId);

    public async Task<bool> CanViewAsync(Guid userId, string role, Guid propertyId, Guid wallId) =>
        await _db.CanSeeProperty(userId, role, propertyId)
        && await _db.Walls.AnyAsync(w => w.Id == wallId && w.PropertyId == propertyId);
}
