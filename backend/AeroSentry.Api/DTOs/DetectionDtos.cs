using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// multipart/form-data body of POST .../detection/frame
public class DetectionFrameRequest
{
    [Required]
    public IFormFile Frame { get; set; } = null!;

    // Optional bookkeeping, stored with an alarm event.
    public int FrameIndex { get; set; }
    public double TimestampSeconds { get; set; }
}

public class DetectionStartResponse
{
    public Guid WallId { get; set; }
    public string Status { get; set; } = "Running";
    public double Threshold { get; set; }
}

public class DetectedPersonDto
{
    public int TrackId { get; set; }

    // [x1, y1, x2, y2], normalised 0-1
    public double[] Box { get; set; } = Array.Empty<double>();
    public double Confidence { get; set; }

    // Foot point = bottom-centre of the box. The cell containing it is where the person is.
    public double FootX { get; set; }
    public double FootY { get; set; }
    public string? CellLabel { get; set; }
}

public class DetectionFrameResponse
{
    public int FramesStreamed { get; set; }
    public double Probability { get; set; }
    public bool AlarmActive { get; set; }

    // True only on the single frame where a new alarm starts.
    public bool AlarmRaised { get; set; }

    // Set when AlarmRaised: the stored event, and the cell the intruder is in (null if outside every cell).
    public Guid? EventId { get; set; }
    public string? CellLabel { get; set; }

    // The alert created for this alarm (already pushed to the apps over SignalR).
    public Guid? AlertId { get; set; }
    public string? IncidentCode { get; set; }

    // Set when the person at the wall was recognised as an authorized enrolled person (informational).
    public RecognizedPersonDto? RecognizedPerson { get; set; }
    public bool AutoResponseSkipped { get; set; }

    public List<DetectedPersonDto> People { get; set; } = new();
}

public class DetectionStopResponse
{
    public int FramesStreamed { get; set; }
    public int AlarmCount { get; set; }
    public double MaxProbability { get; set; }
}

public class DetectionEventResponse
{
    public Guid Id { get; set; }
    public Guid WallId { get; set; }
    public Guid? CellId { get; set; }
    public string? CellLabel { get; set; }
    public double Probability { get; set; }
    public double Threshold { get; set; }
    public int FrameNumber { get; set; }
    public double TimestampSeconds { get; set; }
    public DateTime DetectedAtUtc { get; set; }
}

// One wall the ingest worker must watch.
public class WorkerJobResponse
{
    public Guid WallId { get; set; }
    public Guid PropertyId { get; set; }
    public string WallName { get; set; } = string.Empty;
    public Guid CameraId { get; set; }
    public string CameraName { get; set; } = string.Empty;

    // The picture size the wall was annotated on. The worker warns when the camera's real frames have another shape.
    public int FrameWidth { get; set; }
    public int FrameHeight { get; set; }

    public double Threshold { get; set; }

    // The stream as republished by the media server (MediaMTX). The camera's password is not in it.
    public string MediaSourceUrl { get; set; } = string.Empty;

    // The camera's own address WITH its username and password, for when there is no media server.
    // Only the worker (with its key) ever receives this.
    public string CameraSourceUrl { get; set; } = string.Empty;
}

public class MlHealthResponse
{
    public bool Available { get; set; }
    public bool YoloLoaded { get; set; }
    public bool LstmLoaded { get; set; }
    public string Device { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
