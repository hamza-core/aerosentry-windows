namespace AeroSentry.Api.Services;

public enum ResultStatus { Success, NotFound, Conflict, BadRequest, Unavailable }

// One return type for every service method that can fail in more than one way.
// The controller turns Status into the HTTP code (see ApiControllerBase.FromResult).
public class Result<T>
{
    public ResultStatus Status { get; private set; }
    public string Message { get; private set; } = string.Empty;
    public T? Value { get; private set; }

    public static Result<T> Ok(T value) => new() { Status = ResultStatus.Success, Value = value };
    public static Result<T> NotFound(string message) => new() { Status = ResultStatus.NotFound, Message = message };
    public static Result<T> Conflict(string message) => new() { Status = ResultStatus.Conflict, Message = message };
    public static Result<T> BadRequest(string message) => new() { Status = ResultStatus.BadRequest, Message = message };
    // Something the backend depends on (the ML service) cannot be reached -> 503.
    public static Result<T> Unavailable(string message) => new() { Status = ResultStatus.Unavailable, Message = message };
}
