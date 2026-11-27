namespace AeroSentry.Api.Services.Interfaces;

using AeroSentry.Api.Data.Entities;

// Keeps media/mediamtx.yml in sync with cameras in the database.
// MediaMTX hot-reloads the file, so adding/updating/removing a camera in the API
// makes the cam-<cameraId> path available without a manual config edit.
public interface IMediaMtxConfigService
{
    Task SyncCameraAsync(Camera camera, CancellationToken ct = default);
    Task RemoveCameraAsync(Guid cameraId, CancellationToken ct = default);
    Task SyncAllAsync(CancellationToken ct = default);
}
