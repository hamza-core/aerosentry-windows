using System.Text.Json.Serialization;
using AeroSentry.Api.Services.Interfaces;

namespace AeroSentry.Api.Services;

// The errors FaceClient throws and the parts of the face service's JSON that we use.
// (The interface itself is in Interfaces/IFaceClient.cs.)
public class FaceException : Exception
{
    public FaceException(string message, Exception? inner = null) : base(message, inner) { }
}

// The face service is not running, did not answer in time, or its model is still loading (-> 503).
public class FaceUnavailableException : FaceException
{
    public FaceUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

// The face service could not read the upload as a picture (-> 400).
public class FaceRejectedException : FaceException
{
    public FaceRejectedException(string message) : base(message) { }
}

// ---- the parts of the face service's JSON that we use (names match it exactly) ----
public class FaceAnalysis
{
    [JsonPropertyName("image_width")] public int ImageWidth { get; set; }
    [JsonPropertyName("image_height")] public int ImageHeight { get; set; }
    // Biggest face first.
    [JsonPropertyName("faces")] public List<FaceInfo> Faces { get; set; } = new();
}

public class FaceInfo
{
    // [x1, y1, x2, y2] in pixels of the picture
    [JsonPropertyName("box")] public int[] Box { get; set; } = Array.Empty<int>();
    [JsonPropertyName("det_score")] public double DetScore { get; set; }
    // 512 numbers, length 1
    [JsonPropertyName("embedding")] public float[] Embedding { get; set; } = Array.Empty<float>();

    public int Width => Box[2] - Box[0];
}

// ---- the answer of /api/faces/enrollment-check: one live picture on the capture screen ----
public class FaceEnrollmentCheck
{
    [JsonPropertyName("faces")] public int Faces { get; set; }
    [JsonPropertyName("ok")] public bool Ok { get; set; }
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
    // [x1, y1, x2, y2] as fractions of the picture, or null when there is not exactly one face.
    [JsonPropertyName("box")] public double[]? Box { get; set; }
    [JsonPropertyName("face_width")] public int FaceWidth { get; set; }
    [JsonPropertyName("sharpness")] public double Sharpness { get; set; }
}

// ---- the answer of /api/faces/enrollment-frames: the frames of a video that are good enough to enrol with ----
public class FaceEnrollmentFrame
{
    [JsonPropertyName("time_seconds")] public double TimeSeconds { get; set; }
    [JsonPropertyName("face_width")] public int FaceWidth { get; set; }
    [JsonPropertyName("embedding")] public float[] Embedding { get; set; } = Array.Empty<float>();
    [JsonPropertyName("jpeg_base64")] public string JpegBase64 { get; set; } = string.Empty;
}

public class FaceEnrollmentFrames
{
    [JsonPropertyName("wanted")] public int Wanted { get; set; }
    [JsonPropertyName("frames")] public List<FaceEnrollmentFrame> Frames { get; set; } = new();
    // The average of the kept faces' vectors, scaled to length 1 (what the person's face profile is).
    [JsonPropertyName("mean_embedding")] public float[] MeanEmbedding { get; set; } = Array.Empty<float>();
    [JsonPropertyName("sampled")] public int Sampled { get; set; }
    [JsonPropertyName("no_face")] public int NoFace { get; set; }
    [JsonPropertyName("many_faces")] public int ManyFaces { get; set; }
    [JsonPropertyName("too_small")] public int TooSmall { get; set; }
    [JsonPropertyName("seconds_used")] public double SecondsUsed { get; set; }
}

// ---- the answer of the face service's video analysis (/api/faces/analyze-video) ----
// One entry per head pose it found: the sharpest frame of that pose, with its embedding.
public class FaceVideoPose
{
    // "front", "left", "right", "up" or "down" (named by the order the person made them, see face-service/app.py)
    [JsonPropertyName("pose")] public string Pose { get; set; } = string.Empty;
    [JsonPropertyName("frame_index")] public int FrameIndex { get; set; }
    [JsonPropertyName("time_seconds")] public double TimeSeconds { get; set; }
    [JsonPropertyName("yaw")] public double Yaw { get; set; }
    [JsonPropertyName("pitch")] public double Pitch { get; set; }
    [JsonPropertyName("face_width")] public int FaceWidth { get; set; }
    [JsonPropertyName("sharpness")] public double Sharpness { get; set; }
    [JsonPropertyName("embedding")] public float[] Embedding { get; set; } = Array.Empty<float>();
    [JsonPropertyName("jpeg_base64")] public string JpegBase64 { get; set; } = string.Empty;
}

public class FaceVideoAnalysis
{
    [JsonPropertyName("frames_read")] public int FramesRead { get; set; }
    [JsonPropertyName("frames_analyzed")] public int FramesAnalyzed { get; set; }
    [JsonPropertyName("frames_with_one_face")] public int FramesWithOneFace { get; set; }
    [JsonPropertyName("duration_seconds")] public double DurationSeconds { get; set; }
    [JsonPropertyName("poses")] public List<FaceVideoPose> Poses { get; set; } = new();
    [JsonPropertyName("missing")] public List<string> Missing { get; set; } = new();
}
