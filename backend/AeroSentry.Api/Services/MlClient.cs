using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;

namespace AeroSentry.Api.Services;

public class MlClient : IMlClient
{
    private readonly HttpClient _http;

    public MlClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<MlHealthResponse> HealthAsync()
    {
        try
        {
            using var response = await _http.GetAsync("api/health");
            if (!response.IsSuccessStatusCode)
                return new MlHealthResponse { Available = false, Message = $"ML service answered {(int)response.StatusCode}" };

            var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
            return new MlHealthResponse
            {
                Available = true,
                YoloLoaded = json.GetProperty("yolo_loaded").GetBoolean(),
                LstmLoaded = json.GetProperty("lstm_loaded").GetBoolean(),
                Device = json.GetProperty("device").GetString() ?? "",
                Message = "ML service is running"
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new MlHealthResponse { Available = false, Message = "ML service is not reachable" };
        }
    }

    public async Task<string> StartSessionAsync(
        double[][] top, double[][] bottom, int frameWidth, int frameHeight, double threshold)
    {
        // The ML service wants points as {"x":..,"y":..} objects (its README shows arrays, but the API does not).
        var boundaries = JsonSerializer.Serialize(new
        {
            wall_top_points = top.Select(p => new { x = p[0], y = p[1] }),
            wall_bottom_points = bottom.Select(p => new { x = p[0], y = p[1] }),
            frame_width = frameWidth,
            frame_height = frameHeight
        });

        using var form = new MultipartFormDataContent
        {
            { new StringContent(boundaries), "boundaries" },
            { new StringContent(threshold.ToString(CultureInfo.InvariantCulture)), "threshold" }
        };

        var json = await PostAsync("api/live/start", form);
        return json.RootElement.GetProperty("session_id").GetString()!;
    }

    public async Task<MlFrameResult> SendFrameAsync(string sessionId, byte[] jpeg, int frameIndex, double timestampSeconds)
    {
        var image = new ByteArrayContent(jpeg);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

        using var form = new MultipartFormDataContent
        {
            { new StringContent(sessionId), "session_id" },
            { new StringContent(frameIndex.ToString(CultureInfo.InvariantCulture)), "frame_index" },
            { new StringContent(timestampSeconds.ToString(CultureInfo.InvariantCulture)), "timestamp_seconds" },
            { image, "frame", "frame.jpg" }
        };

        var json = await PostAsync("api/live/frame", form);
        return json.Deserialize<MlFrameResult>()!;
    }

    public async Task<MlSummary> StopSessionAsync(string sessionId)
    {
        using var form = new MultipartFormDataContent { { new StringContent(sessionId), "session_id" } };
        var json = await PostAsync("api/live/stop", form);
        return json.Deserialize<MlSummary>()!;
    }

    // One place that sends a request and turns ML failures into our own exceptions.
    private async Task<JsonDocument> PostAsync(string path, HttpContent content)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync(path, content);
        }
        catch (HttpRequestException ex)
        {
            throw new MlUnavailableException("ML service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new MlUnavailableException("ML service timed out", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
                return JsonDocument.Parse(body);

            if (response.StatusCode == HttpStatusCode.NotFound)
                throw new MlSessionNotFoundException();

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new MlRejectedException(ReadDetail(body));

            throw new MlUnavailableException($"ML service answered {(int)response.StatusCode}");
        }
    }

    // FastAPI errors look like {"detail": "..."}.
    private static string ReadDetail(string body)
    {
        try
        {
            var detail = JsonDocument.Parse(body).RootElement.GetProperty("detail");
            return detail.ValueKind == JsonValueKind.String ? detail.GetString()! : detail.ToString();
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException)
        {
            return "ML service rejected the request";
        }
    }
}
