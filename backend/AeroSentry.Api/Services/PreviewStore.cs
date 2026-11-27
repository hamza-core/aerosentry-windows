using System.Collections.Concurrent;

namespace AeroSentry.Api.Services;

// Holds the latest live-preview picture of each wall. One instance for the whole backend (a singleton), because the
// worker's request that stores a picture and the viewers' requests that read it are different requests.
public class PreviewStore
{
    public const int MaxBytes = 2 * 1024 * 1024;   // one picture; the worker sends about 640 px wide, around 40 KB
    public const int MaxWalls = 200;               // stops random wall ids from filling the memory

    private readonly ConcurrentDictionary<Guid, PreviewFrame> _latest = new();
    private long _sequence;

    public bool Put(Guid wallId, byte[] jpeg)
    {
        // A JPEG starts with FF D8 and ends with FF D9. Anything else is not something a viewer can show.
        if (jpeg.Length < 4 || jpeg.Length > MaxBytes) return false;
        if (jpeg[0] != 0xFF || jpeg[1] != 0xD8 || jpeg[^2] != 0xFF || jpeg[^1] != 0xD9) return false;

        if (!_latest.ContainsKey(wallId) && _latest.Count >= MaxWalls)
        {
            var oldest = _latest.OrderBy(p => p.Value.AtUtc).First().Key;
            _latest.TryRemove(oldest, out _);
        }

        _latest[wallId] = new PreviewFrame(jpeg, Interlocked.Increment(ref _sequence), DateTime.UtcNow);
        return true;
    }

    public PreviewFrame? Get(Guid wallId) => _latest.TryGetValue(wallId, out var frame) ? frame : null;
}
