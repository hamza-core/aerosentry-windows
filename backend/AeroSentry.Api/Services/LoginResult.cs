using AeroSentry.Api.DTOs;

namespace AeroSentry.Api.Services;

public enum LoginStatus { Success, InvalidCredentials, Suspended }

public class LoginResult
{
    public LoginStatus Status { get; set; }
    public LoginResponse? Response { get; set; }
}