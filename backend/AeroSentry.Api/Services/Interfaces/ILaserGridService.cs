using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

public interface ILaserGridService
{
    Task<Result<List<LaserGridResponse>>> ListAsync(Guid userId, string role, Guid propertyId);
    Task<Result<LaserGridResponse>> GetAsync(Guid userId, string role, Guid propertyId, Guid id);
    Task<Result<LaserGridResponse>> CreateAsync(Guid adminId, Guid propertyId, LaserGridRequest request);
    Task<Result<LaserGridResponse>> UpdateAsync(Guid adminId, Guid propertyId, Guid id, LaserGridRequest request);
    Task<Result<bool>> DeleteAsync(Guid adminId, Guid propertyId, Guid id);
}
