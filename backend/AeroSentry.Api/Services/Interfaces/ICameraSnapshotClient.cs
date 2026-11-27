using AeroSentry.Api.Data.Entities;

namespace AeroSentry.Api.Services.Interfaces;

// Fetches one still JPEG from a phone camera running the IP Webcam app (plain HTTP, optional login).
// The admin app draws the wall annotation on this picture.
public interface ICameraSnapshotClient
{
    Task<byte[]> GetJpegAsync(Camera camera);
}
