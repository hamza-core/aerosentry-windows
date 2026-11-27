using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace AeroSentry.Api.Hubs;

// Remembers which SignalR connections are open for which user, so the server can CLOSE them.
// Why: a token is only checked when a connection opens. Without this, a guard who is suspended or
// deleted would keep their open socket (and could keep listening) until the app disconnected.
// One instance for the whole app (singleton), held in memory.
public class ConnectionTracker
{
    // connectionId -> (userId, the connection's context, which has Abort())
    private readonly ConcurrentDictionary<string, (string UserId, HubCallerContext Context)> _connections = new();

    public void Add(string? userId, HubCallerContext context)
    {
        if (userId is not null)
            _connections[context.ConnectionId] = (userId, context);
    }

    public void Remove(string connectionId) => _connections.TryRemove(connectionId, out _);

    // Closes every open connection of this user. The app sees its connection drop; its next
    // attempt to connect is refused, because a suspended or deleted user's token no longer validates.
    public void Disconnect(Guid userId)
    {
        var id = userId.ToString();
        foreach (var entry in _connections.Where(c => c.Value.UserId == id).ToList())
        {
            entry.Value.Context.Abort();
            _connections.TryRemove(entry.Key, out _);
        }
    }
}
