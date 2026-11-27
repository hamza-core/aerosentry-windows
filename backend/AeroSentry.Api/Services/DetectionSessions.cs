using System.Collections.Concurrent;

namespace AeroSentry.Api.Services;

public class DetectionSession
{
    public string MlSessionId { get; init; } = string.Empty;
    public double Threshold { get; init; }

    // The ML session keeps per-camera tracking state, so frames of one wall must go in one at a time.
    public SemaphoreSlim Gate { get; } = new(1, 1);

    // The last few pictures of this wall with the people found in them (about 2 seconds). On an alarm the faces are looked for in
    // several of them, because the person may be facing away in the exact alarm frame. Lost when the session is reset.
    private readonly List<RecognitionFrame> _recent = new();
    private readonly object _recentLock = new();
    private const int MaxRecent = 12;

    public void Remember(RecognitionFrame frame)
    {
        lock (_recentLock)
        {
            _recent.Add(frame);
            if (_recent.Count > MaxRecent)
                _recent.RemoveAt(0);
        }
    }

    // Up to `count` earlier frames spread evenly over the history (so they show different moments), oldest first.
    // The last `count` pictures before now, NEWEST first.
    public List<RecognitionFrame> NewestFirst(int count)
    {
        lock (_recentLock)
            return _recent.AsEnumerable().Reverse().Take(count).ToList();
    }

    public List<RecognitionFrame> Earlier(int count)
    {
        lock (_recentLock)
        {
            if (count <= 0 || _recent.Count == 0)
                return new();
            if (_recent.Count <= count)
                return _recent.ToList();

            var picked = new List<RecognitionFrame>();
            for (var i = 0; i < count; i++)
            {
                var index = count == 1 ? _recent.Count - 1 : (int)Math.Round(i * (_recent.Count - 1) / (double)(count - 1));
                picked.Add(_recent[index]);
            }
            return picked;
        }
    }
}

// Which ML session belongs to which wall. One instance for the whole app (singleton), held in memory:
// like the ML service's own sessions, it is empty after a restart (DetectionService re-opens on demand).
public class DetectionSessions
{
    private readonly ConcurrentDictionary<Guid, DetectionSession> _byWall = new();

    public DetectionSession? Get(Guid wallId) => _byWall.GetValueOrDefault(wallId);

    public void Set(Guid wallId, DetectionSession session) => _byWall[wallId] = session;

    public DetectionSession? Remove(Guid wallId) => _byWall.TryRemove(wallId, out var s) ? s : null;
}
