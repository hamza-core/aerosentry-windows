using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services;

public enum CameraStatus { Success, NotFound, DuplicateName }

public class CameraResult
{
    public CameraStatus Status { get; set; }
    public CameraResponse? Camera { get; set; }
}
