using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

public interface IDetectionService
{
    // Turns watching on for a wall (saved in the database) and opens the ML live session.
    Task<Result<DetectionStartResponse>> StartAsync(Guid adminId, Guid propertyId, Guid wallId, double? threshold);

    // One JPEG frame in; probability, people with their cells, and a stored event on a new alarm out.
    Task<Result<DetectionFrameResponse>> FrameAsync(Guid adminId, Guid propertyId, Guid wallId, byte[] jpeg, int frameIndex, double timestampSeconds);

    // Turns watching off. Safe to call after a backend restart (the database still says "on").
    Task<Result<DetectionStopResponse>> StopAsync(Guid adminId, Guid propertyId, Guid wallId);

    // Forgets the wall's ML session (and tells the ML service). The next frame opens a new one with the
    // wall's current annotation. Called when the annotation changes. Never throws.
    Task ResetSessionAsync(Guid wallId);

    Task<Result<PagedResponse<DetectionEventResponse>>> ListEventsAsync(Guid userId, string role, Guid propertyId, Guid wallId, int page, int pageSize);

    // ---- for the ingest worker (it has a machine key, not a user login) ----

    // Every wall that is switched on and whose camera is active.
    Task<List<WorkerJobResponse>> ListJobsAsync();

    // Same as FrameAsync, but for any wall (no owner check). 409 if the wall is not switched on.
    Task<Result<DetectionFrameResponse>> WorkerFrameAsync(Guid wallId, byte[] jpeg, int frameIndex, double timestampSeconds);
}
