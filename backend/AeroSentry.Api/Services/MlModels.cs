using System.Text.Json.Serialization;
using AeroSentry.Api.Services.Interfaces;

namespace AeroSentry.Api.Services;

// (The interface itself is in Interfaces/IMlClient.cs.)

// ---- errors the client throws; DetectionService turns them into Result codes ----
public class MlException : Exception
{
    public MlException(string message, Exception? inner = null) : base(message, inner) { }
}

// ML service not reachable, timed out, or its models are not loaded (-> 503).
public class MlUnavailableException : MlException
{
    public MlUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

// ML service refused the input: bad JPEG or bad wall boundaries (-> 400).
public class MlRejectedException : MlException
{
    public MlRejectedException(string message) : base(message) { }
}

// ML service does not know this session id (it was restarted, or the session was stopped).
public class MlSessionNotFoundException : MlException
{
    public MlSessionNotFoundException() : base("ML session not found") { }
}

// ---- the parts of the ML JSON we use (names match the ML service exactly) ----
public class MlFrameResult
{
    [JsonPropertyName("frames_streamed")] public int FramesStreamed { get; set; }
    [JsonPropertyName("latest_probability")] public double LatestProbability { get; set; }
    [JsonPropertyName("alarm_active")] public bool AlarmActive { get; set; }
    [JsonPropertyName("alarm_raised")] public bool AlarmRaised { get; set; }
    [JsonPropertyName("people")] public List<MlPerson> People { get; set; } = new();
}

public class MlPerson
{
    [JsonPropertyName("track_id")] public int TrackId { get; set; }
    // [x1, y1, x2, y2], normalised 0-1
    [JsonPropertyName("box")] public double[] Box { get; set; } = Array.Empty<double>();
    [JsonPropertyName("confidence")] public double Confidence { get; set; }
}

public class MlSummary
{
    [JsonPropertyName("frames_streamed")] public int FramesStreamed { get; set; }
    [JsonPropertyName("alarm_count")] public int AlarmCount { get; set; }
    [JsonPropertyName("max_probability")] public double MaxProbability { get; set; }
}
