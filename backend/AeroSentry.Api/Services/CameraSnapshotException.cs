namespace AeroSentry.Api.Services;

// The camera could not give us a picture (offline, wrong login, ...). The message is safe to show to the admin.
public class CameraSnapshotException : Exception
{
    public CameraSnapshotException(string message) : base(message) { }
}
