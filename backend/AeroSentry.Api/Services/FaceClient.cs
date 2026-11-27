using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using AeroSentry.Api.Services.Interfaces;

namespace AeroSentry.Api.Services;

public class FaceClient : IFaceClient
{
    private readonly HttpClient _http;

    public FaceClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<FaceAnalysis> AnalyzeAsync(byte[] image, int? detSize = null, CancellationToken cancellationToken = default)
    {
        var picture = new ByteArrayContent(image);
        picture.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

        using var form = new MultipartFormDataContent { { picture, "image", "picture" } };
        if (detSize is not null)
            form.Add(new StringContent(detSize.Value.ToString(CultureInfo.InvariantCulture)), "det_size");

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("api/faces/analyze", form, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new FaceUnavailableException("The face service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new FaceUnavailableException("The face service did not answer in time", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<FaceAnalysis>(body)!;

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new FaceRejectedException(ReadDetail(body));

            throw new FaceUnavailableException($"The face service answered {(int)response.StatusCode}");
        }
    }

    public async Task<FaceVideoAnalysis> AnalyzeVideoAsync(byte[] video, CancellationToken cancellationToken = default)
    {
        var content = new ByteArrayContent(video);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var form = new MultipartFormDataContent { { content, "video", "liveness.mp4" } };

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("api/faces/analyze-video", form, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new FaceUnavailableException("The face service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new FaceUnavailableException("The face service did not finish the video in time", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<FaceVideoAnalysis>(body)!;

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new FaceRejectedException(ReadDetail(body));

            throw new FaceUnavailableException(response.StatusCode == HttpStatusCode.ServiceUnavailable
                ? ReadDetail(body)
                : $"The face service answered {(int)response.StatusCode}");
        }
    }

    public async Task<FaceEnrollmentFrames> EnrollmentFramesAsync(byte[] video, CancellationToken cancellationToken = default)
    {
        var content = new ByteArrayContent(video);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var form = new MultipartFormDataContent { { content, "video", "enrolment.video" } };

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("api/faces/enrollment-frames", form, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new FaceUnavailableException("The face service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new FaceUnavailableException("The face service did not finish the video in time", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<FaceEnrollmentFrames>(body)!;

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new FaceRejectedException(ReadDetail(body));

            throw new FaceUnavailableException(response.StatusCode == HttpStatusCode.ServiceUnavailable
                ? ReadDetail(body)
                : $"The face service answered {(int)response.StatusCode}");
        }
    }

    public async Task<FaceEnrollmentCheck> EnrollmentCheckAsync(byte[] image, CancellationToken cancellationToken = default)
    {
        var content = new ByteArrayContent(image);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var form = new MultipartFormDataContent { { content, "image", "frame.jpg" } };

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("api/faces/enrollment-check", form, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new FaceUnavailableException("The face service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new FaceUnavailableException("The face service did not answer in time", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<FaceEnrollmentCheck>(body)!;

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new FaceRejectedException(ReadDetail(body));

            throw new FaceUnavailableException(response.StatusCode == HttpStatusCode.ServiceUnavailable
                ? ReadDetail(body)
                : $"The face service answered {(int)response.StatusCode}");
        }
    }

    public async Task<FaceEnrollmentFrames> EnrollmentImagesAsync(IReadOnlyList<byte[]> images, CancellationToken cancellationToken = default)
    {
        using var form = new MultipartFormDataContent();
        for (var i = 0; i < images.Count; i++)
        {
            var content = new ByteArrayContent(images[i]);
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(content, "images", $"frame{i + 1:00}.jpg");
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("api/faces/enrollment-images", form, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new FaceUnavailableException("The face service is not reachable", ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new FaceUnavailableException("The face service did not finish the pictures in time", ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<FaceEnrollmentFrames>(body)!;

            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
                throw new FaceRejectedException(ReadDetail(body));

            throw new FaceUnavailableException(response.StatusCode == HttpStatusCode.ServiceUnavailable
                ? ReadDetail(body)
                : $"The face service answered {(int)response.StatusCode}");
        }
    }

    public async Task<bool> IsAvailableAsync()
    {
        try
        {
            using var response = await _http.GetAsync("api/health");
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    // FastAPI errors look like {"detail": "..."}.
    private static string ReadDetail(string body)
    {
        try
        {
            return JsonDocument.Parse(body).RootElement.GetProperty("detail").GetString() ?? "The face service rejected the picture";
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            return "The face service rejected the picture";
        }
    }
}
