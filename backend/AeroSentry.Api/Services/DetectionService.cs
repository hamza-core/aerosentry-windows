using System.Text.Json;
using AeroSentry.Api.Data;
using AeroSentry.Api.Data.Entities;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Services;

// The detection bridge: wall annotation -> ML service -> person boxes -> wall cell -> stored event.
public class DetectionService : IDetectionService
{
    private const int MaxFrameBytes = 5 * 1024 * 1024;

    private readonly AppDbContext _db;
    private readonly IMlClient _ml;
    private readonly DetectionSessions _sessions;
    private readonly IConfiguration _config;
    private readonly IAlertService _alerts;
    private readonly IPersonService _people;

    public DetectionService(AppDbContext db, IMlClient ml, DetectionSessions sessions, IConfiguration config, IAlertService alerts, IPersonService people)
    {
        _people = people;
        _db = db;
        _ml = ml;
        _sessions = sessions;
        _config = config;
        _alerts = alerts;
    }

    private double DefaultThreshold => _config.GetValue<double?>("Ml:Threshold") ?? 0.5;

    // What happens when every person at the wall is a trusted, authorized person:
    //   "SkipDrone" (default) : the alert is still created and pushed, but marked AutoResponseSkipped so no drone is sent;
    //   "LabelOnly"           : the alert only names the person, and the full response stays on.
    // Anything else counts as LabelOnly (when unsure, keep the response on).
    private bool SkipDroneForAuthorized => string.Equals(_config["Face:AuthorizedPolicy"] ?? "SkipDrone", "SkipDrone", StringComparison.OrdinalIgnoreCase);
    // How many pictures to look at for faces on an alarm: the alarm frame plus (this - 1) earlier ones.
    // How far back to look for the person when the alarm picture shows nobody: 5 analysed pictures, about one second.
    private const int LastSeenFrames = 5;

    // The cell of the most recent picture that had a person with a usable box. If those people were all outside the cells: none.
    private static WallCell? LastSeenCell(List<RecognitionFrame> newestFirst, IEnumerable<WallCell> cells)
    {
        var lastWithPeople = newestFirst.FirstOrDefault(f => f.People.Any(p => CellLocator.IsUsableBox(p.Box)));
        return lastWithPeople?.People
            .Where(p => CellLocator.IsUsableBox(p.Box))
            .Select(p => CellLocator.Find(cells, (p.Box[0] + p.Box[2]) / 2, p.Box[3]))   // foot point: bottom-centre of the box
            .FirstOrDefault(c => c is not null);
    }

    private int RecognitionFrames => _config.GetValue<int?>("Face:RecognitionFrames") ?? 5;
    private string RtspBase => (_config["Media:RtspBase"] ?? "rtsp://localhost:8554").TrimEnd('/');

    public async Task<Result<DetectionStartResponse>> StartAsync(Guid adminId, Guid propertyId, Guid wallId, double? threshold)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<DetectionStartResponse>.NotFound("Property not found");

        var wall = await _db.Walls.FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<DetectionStartResponse>.NotFound("Wall not found");

        var value = threshold ?? DefaultThreshold;
        if (value < 0.05 || value > 0.95)
            return Result<DetectionStartResponse>.BadRequest("threshold must be between 0.05 and 0.95");

        try
        {
            await CloseSessionAsync(wallId);   // start fresh: the wall's annotation may have changed
            var session = await OpenSessionAsync(wall, value);

            // Only after the ML service accepted the wall: remember "this wall is being watched".
            wall.DetectionEnabled = true;
            wall.DetectionThreshold = value;
            await _db.SaveChangesAsync();

            return Result<DetectionStartResponse>.Ok(new DetectionStartResponse
            {
                WallId = wall.Id,
                Threshold = session.Threshold
            });
        }
        catch (MlException ex)
        {
            return FromMlError<DetectionStartResponse>(ex);
        }
    }

    public async Task<Result<DetectionFrameResponse>> FrameAsync(
        Guid adminId, Guid propertyId, Guid wallId, byte[] jpeg, int frameIndex, double timestampSeconds)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<DetectionFrameResponse>.NotFound("Property not found");

        var wall = await _db.Walls.Include(w => w.Cells)
            .FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<DetectionFrameResponse>.NotFound("Wall not found");

        return await ProcessFrameAsync(wall, jpeg, frameIndex, timestampSeconds);
    }

    public Task ResetSessionAsync(Guid wallId) => CloseSessionAsync(wallId);

    public async Task<Result<DetectionFrameResponse>> WorkerFrameAsync(
        Guid wallId, byte[] jpeg, int frameIndex, double timestampSeconds)
    {
        var wall = await _db.Walls.Include(w => w.Cells).FirstOrDefaultAsync(w => w.Id == wallId);
        if (wall is null)
            return Result<DetectionFrameResponse>.NotFound("Wall not found");

        if (!wall.DetectionEnabled)
            return Result<DetectionFrameResponse>.Conflict("Detection is not enabled for this wall");

        return await ProcessFrameAsync(wall, jpeg, frameIndex, timestampSeconds);
    }

    public async Task<Result<DetectionStopResponse>> StopAsync(Guid adminId, Guid propertyId, Guid wallId)
    {
        if (!await _db.OwnsProperty(adminId, propertyId))
            return Result<DetectionStopResponse>.NotFound("Property not found");

        var wall = await _db.Walls.FirstOrDefaultAsync(w => w.Id == wallId && w.PropertyId == propertyId);
        if (wall is null)
            return Result<DetectionStopResponse>.NotFound("Wall not found");

        var session = _sessions.Remove(wallId);
        if (session is null && !wall.DetectionEnabled)
            return Result<DetectionStopResponse>.NotFound("No detection session is running for this wall");

        wall.DetectionEnabled = false;
        await _db.SaveChangesAsync();

        // Switched on in the database but no session in memory (the backend restarted): nothing more to close.
        if (session is null)
            return Result<DetectionStopResponse>.Ok(new DetectionStopResponse());

        try
        {
            var summary = await _ml.StopSessionAsync(session.MlSessionId);
            return Result<DetectionStopResponse>.Ok(new DetectionStopResponse
            {
                FramesStreamed = summary.FramesStreamed,
                AlarmCount = summary.AlarmCount,
                MaxProbability = summary.MaxProbability
            });
        }
        catch (MlSessionNotFoundException)
        {
            // The ML service already forgot it (restarted). Our side is closed, which is what matters.
            return Result<DetectionStopResponse>.Ok(new DetectionStopResponse());
        }
        catch (MlException ex)
        {
            return FromMlError<DetectionStopResponse>(ex);
        }
    }

    public async Task<Result<PagedResponse<DetectionEventResponse>>> ListEventsAsync(
        Guid userId, string role, Guid propertyId, Guid wallId, int page, int pageSize)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
            return Result<PagedResponse<DetectionEventResponse>>.BadRequest("page must be 1 or more and pageSize from 1 to 100");

        if (!await _db.CanSeeProperty(userId, role, propertyId))
            return Result<PagedResponse<DetectionEventResponse>>.NotFound("Property not found");

        if (!await _db.Walls.AnyAsync(w => w.Id == wallId && w.PropertyId == propertyId))
            return Result<PagedResponse<DetectionEventResponse>>.NotFound("Wall not found");

        var query = _db.DetectionEvents.Where(e => e.WallId == wallId);
        var total = await query.CountAsync();
        // Project the columns: the event also holds the alarm picture, which a list must not drag along.
        var rows = await query
            .OrderByDescending(e => e.DetectedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new DetectionEventResponse
            {
                Id = e.Id, WallId = e.WallId, CellId = e.CellId, CellLabel = e.CellLabel, Probability = e.Probability,
                Threshold = e.Threshold, FrameNumber = e.FrameNumber, TimestampSeconds = e.TimestampSeconds, DetectedAtUtc = e.DetectedAtUtc
            })
            .ToListAsync();

        return Result<PagedResponse<DetectionEventResponse>>.Ok(new PagedResponse<DetectionEventResponse>
        {
            Items = rows,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        });
    }

    public async Task<List<WorkerJobResponse>> ListJobsAsync()
    {
        var walls = await _db.Walls
            .Include(w => w.Camera)
            .Where(w => w.DetectionEnabled && w.Camera.IsActive)
            .OrderBy(w => w.Name)
            .ToListAsync();

        return walls.Select(w => new WorkerJobResponse
        {
            WallId = w.Id,
            PropertyId = w.PropertyId,
            WallName = w.Name,
            CameraId = w.CameraId,
            CameraName = w.Camera.Name,
            FrameWidth = w.FrameWidth,
            FrameHeight = w.FrameHeight,
            Threshold = w.DetectionThreshold ?? DefaultThreshold,
            MediaSourceUrl = $"{RtspBase}/cam-{w.CameraId}",
            CameraSourceUrl = BuildCameraUrl(w.Camera)
        }).ToList();
    }

    // ---- the part shared by the admin's and the worker's frame functions ----

    private async Task<Result<DetectionFrameResponse>> ProcessFrameAsync(
        Wall wall, byte[] jpeg, int frameIndex, double timestampSeconds)
    {
        if (jpeg.Length == 0 || jpeg.Length > MaxFrameBytes)
            return Result<DetectionFrameResponse>.BadRequest("The frame must be a JPEG of at most 5 MB");

        MlFrameResult ml;
        DetectionSession session;
        try
        {
            // No session yet (first frame, or the backend restarted): open one.
            session = _sessions.Get(wall.Id) ?? await OpenSessionAsync(wall, wall.DetectionThreshold ?? DefaultThreshold);

            // Remember WHICH gate we took: on recovery `session` is replaced by a new one,
            // and releasing the new session's gate (never taken) would throw.
            var gate = session.Gate;
            await gate.WaitAsync();
            try
            {
                try
                {
                    ml = await _ml.SendFrameAsync(session.MlSessionId, jpeg, frameIndex, timestampSeconds);
                }
                catch (MlSessionNotFoundException)
                {
                    // The ML service restarted and forgot the session: open a new one and retry once.
                    _sessions.Remove(wall.Id);
                    session = await OpenSessionAsync(wall, session.Threshold);
                    ml = await _ml.SendFrameAsync(session.MlSessionId, jpeg, frameIndex, timestampSeconds);
                }
            }
            finally
            {
                gate.Release();
            }
        }
        catch (MlException ex)
        {
            return FromMlError<DetectionFrameResponse>(ex);
        }

        // Where is each person? Foot point = bottom-centre of the box.
        var people = ml.People.Select(p => ToPerson(p, wall.Cells)).ToList();

        // Keep this picture in the wall's short history. On an alarm, faces are looked for in it and in a few earlier ones.
        var thisFrame = new RecognitionFrame(jpeg, people.Select(p => new TrackBox(p.TrackId, p.Box)).ToList());
        var earlierFrames = ml.AlarmRaised ? session.Earlier(RecognitionFrames - 1) : new List<RecognitionFrame>();
        var justBefore = ml.AlarmRaised ? session.NewestFirst(LastSeenFrames) : new List<RecognitionFrame>();
        session.Remember(thisFrame);

        var response = new DetectionFrameResponse
        {
            FramesStreamed = ml.FramesStreamed,
            Probability = ml.LatestProbability,
            AlarmActive = ml.AlarmActive,
            AlarmRaised = ml.AlarmRaised,
            People = people
        };

        if (ml.AlarmRaised)
        {
            // The model says "an intrusion is happening", not who. Take the most confident person
            // who stands inside a cell; if nobody does, the event has no cell.
            var intruder = people.Where(p => p.CellLabel is not null).OrderByDescending(p => p.Confidence).FirstOrDefault();
            var cell = intruder is null ? null : wall.Cells.First(c => c.Label == intruder.CellLabel);

            // The model judges the last few seconds, so it can raise the alarm on a picture where the person detector sees
            // NOBODY (a climber half hidden by the wall), or where every box is unusable. The person is then where we last
            // saw them properly, a moment ago. Someone with a good box who is outside every cell stays "outside".
            if (cell is null && !people.Any(p => CellLocator.IsUsableBox(p.Box)))
                cell = LastSeenCell(justBefore, wall.Cells);

            var detection = new DetectionEvent
            {
                WallId = wall.Id,
                CellId = cell?.Id,
                CellLabel = cell?.Label,
                Probability = ml.LatestProbability,
                Threshold = session.Threshold,
                FrameNumber = ml.FramesStreamed,
                TimestampSeconds = timestampSeconds,
                MlSessionId = session.MlSessionId,
                AlarmSnapshot = jpeg   // so a guard can SEE who it is (alerts/get-snapshot)
            };
            _db.DetectionEvents.Add(detection);

            // Is everyone at the wall a trusted, authorized person? Strict rules (see IPersonService): a wide-enough face, the same
            // person in several frames, and EVERY person cleared. Best effort: faces at a wall camera are often too small, and then
            // nobody is recognised and the full response stays on.
            var target = intruder ?? people.OrderByDescending(p => p.Confidence).FirstOrDefault();
            var recognition = target is null
                ? new AlarmRecognition(null, false)
                : await _people.RecognizeForAlarmAsync(wall.PropertyId, earlierFrames.Append(thisFrame).ToList(), target.TrackId);

            // The alert is ALWAYS created and pushed. Recognition only names the person, and (policy SkipDrone) marks that no
            // automatic response (drone) is to be sent. A guard then looks at the picture and confirms (alerts/confirm-authorized).
            var skipResponse = SkipDroneForAuthorized && recognition.AllCleared && recognition.Person is not null;

            // Saves the event AND its alert together, then pushes the alert to the apps over SignalR.
            var alert = await _alerts.CreateForDetectionAsync(detection, wall.PropertyId, recognition.Person, skipResponse);

            response.EventId = detection.Id;
            response.CellLabel = detection.CellLabel;
            response.AlertId = alert.Id;
            response.IncidentCode = alert.IncidentCode;
            response.RecognizedPerson = alert.RecognizedPerson;
            response.AutoResponseSkipped = alert.AutoResponseSkipped;
        }

        return Result<DetectionFrameResponse>.Ok(response);
    }

    // ---- helpers ----

    private async Task<DetectionSession> OpenSessionAsync(Wall wall, double threshold)
    {
        var top = JsonSerializer.Deserialize<double[][]>(wall.TopPointsJson)!;
        var bottom = JsonSerializer.Deserialize<double[][]>(wall.BottomPointsJson)!;

        var mlSessionId = await _ml.StartSessionAsync(top, bottom, wall.FrameWidth, wall.FrameHeight, threshold);

        var session = new DetectionSession { MlSessionId = mlSessionId, Threshold = threshold };
        _sessions.Set(wall.Id, session);
        return session;
    }

    // Best effort: forget our session and tell the ML service, ignoring ML errors.
    private async Task CloseSessionAsync(Guid wallId)
    {
        var old = _sessions.Remove(wallId);
        if (old is null)
            return;

        try { await _ml.StopSessionAsync(old.MlSessionId); }
        catch (MlException) { }
    }

    // The camera's own address with its login, e.g. rtsp://user:pass@192.168.1.20:554/stream1
    // MobileApp (IP Webcam) streams over http; Rtsp and Onvif cameras are read over rtsp.
    private static string BuildCameraUrl(Camera c)
    {
        // A phone camera app serves pictures over http (/video) and H.264 over rtsp (the paths ending in .sdp). The same rule
        // as the media server's settings (MediaMtxConfigService): with the wrong one the worker would open a dead address.
        var phonePictureStream = c.SourceType == "MobileApp" && !(c.StreamPath ?? "").EndsWith(".sdp", StringComparison.OrdinalIgnoreCase);
        var scheme = phonePictureStream ? "http" : "rtsp";

        var login = "";
        if (c.Username is not null)
        {
            login = Uri.EscapeDataString(c.Username);
            if (c.Password is not null)
                login += ":" + Uri.EscapeDataString(c.Password);
            login += "@";
        }

        return $"{scheme}://{login}{c.Host}:{c.Port}{c.StreamPath}";
    }

    private static DetectedPersonDto ToPerson(MlPerson p, IEnumerable<WallCell> cells)
    {
        // box = [x1, y1, x2, y2]
        var footX = (p.Box[0] + p.Box[2]) / 2;
        var footY = p.Box[3];

        return new DetectedPersonDto
        {
            TrackId = p.TrackId,
            Box = p.Box,
            Confidence = p.Confidence,
            FootX = footX,
            FootY = footY,
            CellLabel = CellLocator.IsUsableBox(p.Box) ? CellLocator.Find(cells, footX, footY)?.Label : null
        };
    }

    private static Result<T> FromMlError<T>(MlException ex) => ex switch
    {
        MlRejectedException => Result<T>.BadRequest(ex.Message),
        _ => Result<T>.Unavailable(ex.Message)
    };

    private static DetectionEventResponse ToResponse(DetectionEvent e) => new()
    {
        Id = e.Id,
        WallId = e.WallId,
        CellId = e.CellId,
        CellLabel = e.CellLabel,
        Probability = e.Probability,
        Threshold = e.Threshold,
        FrameNumber = e.FrameNumber,
        TimestampSeconds = e.TimestampSeconds,
        DetectedAtUtc = e.DetectedAtUtc
    };
}
