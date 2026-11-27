namespace AeroSentry.Api.Services.Interfaces;

// The only class that talks to the face service (port 8020). It finds faces in a picture and returns their embeddings.
public interface IFaceClient
{
    // detSize: how hard to look for small faces (320 to 1920, default 640; bigger = finds smaller faces but slower).
    Task<FaceAnalysis> AnalyzeAsync(byte[] image, int? detSize = null, CancellationToken cancellationToken = default);

    // A short video of a person turning their head: the face service picks the sharpest frame of each head pose and
    // returns it with its embedding. Takes a few seconds.
    Task<FaceVideoAnalysis> AnalyzeVideoAsync(byte[] video, CancellationToken cancellationToken = default);

    // A video of one person facing the camera: a frame about every 0.4 s, keeping those with one large enough face, up to 30.
    Task<FaceEnrollmentFrames> EnrollmentFramesAsync(byte[] video, CancellationToken cancellationToken = default);

    // One live picture while enrolling: where is the face, is it good enough, how sharp?
    Task<FaceEnrollmentCheck> EnrollmentCheckAsync(byte[] image, CancellationToken cancellationToken = default);

    // The captured pictures: each is judged again, the 30 sharpest good ones are kept.
    Task<FaceEnrollmentFrames> EnrollmentImagesAsync(IReadOnlyList<byte[]> images, CancellationToken cancellationToken = default);

    // Never throws.
    Task<bool> IsAvailableAsync();
}
