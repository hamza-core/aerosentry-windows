namespace AeroSentry.Api.Services.Interfaces;

// The live picture of a watched wall: the ingest worker draws the people the model found on the camera picture
// (a box for every person, red while the climbing alarm is on) and sends it here; the apps watch it as a picture stream.
// Only the LATEST picture of each wall is kept, in memory: nothing is written to disk or the database.
public interface IPreviewService
{
    // The worker's picture. false = it is not a JPEG, or too big.
    bool Publish(Guid wallId, byte[] jpeg);

    // The newest picture of a wall, or null if there is none.
    PreviewFrame? Latest(Guid wallId);

    // May this user watch this wall? Admins their own properties, guards the properties they are assigned to.
    Task<bool> CanViewAsync(Guid userId, string role, Guid propertyId, Guid wallId);
}
