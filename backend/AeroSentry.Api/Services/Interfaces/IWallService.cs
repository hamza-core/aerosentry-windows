using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

public interface IWallService
{
    Task<Result<List<WallResponse>>> ListAsync(Guid userId, string role, Guid propertyId);
    Task<Result<WallResponse>> GetAsync(Guid userId, string role, Guid propertyId, Guid id);
    Task<Result<WallResponse>> CreateAsync(Guid adminId, Guid propertyId, WallRequest request);
    Task<Result<WallResponse>> UpdateAsync(Guid adminId, Guid propertyId, Guid id, WallRequest request);
    Task<Result<bool>> DeleteAsync(Guid adminId, Guid propertyId, Guid id);

    // Saves only the wall annotation (the two lines the admin drew on a camera picture).
    // If the annotation really changed, a running ML session is reset so the new lines are used at once.
    Task<Result<WallResponse>> SaveAnnotationAsync(Guid adminId, Guid propertyId, Guid id, WallAnnotationRequest request);
}
