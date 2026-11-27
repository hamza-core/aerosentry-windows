using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services.Interfaces;

// The only class that talks to the ML service (frozen FastAPI, port 8010).
// Nothing else in the backend knows its URLs or its JSON.
public interface IMlClient
{
    // Never throws: when the ML service is down, Available is false.
    Task<MlHealthResponse> HealthAsync();

    // Opens a live session for one wall. Returns the ML session id.
    Task<string> StartSessionAsync(double[][] top, double[][] bottom, int frameWidth, int frameHeight, double threshold);

    // Sends one JPEG frame to a live session.
    Task<MlFrameResult> SendFrameAsync(string sessionId, byte[] jpeg, int frameIndex, double timestampSeconds);

    // Closes a session. Returns the ML summary.
    Task<MlSummary> StopSessionAsync(string sessionId);
}
