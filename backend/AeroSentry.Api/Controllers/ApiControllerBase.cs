using System.Security.Claims;
using AeroSentry.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

// Shared by the controllers of Feature 4 onwards: who is calling, and Result -> HTTP code.
[ApiController]
[Authorize]   // any signed-in user; write actions add Roles = "Admin"
public abstract class ApiControllerBase : ControllerBase
{
    protected Guid CallerId => Guid.Parse(User.FindFirstValue("sub")!);
    protected string CallerRole => User.FindFirstValue("role")!;

    protected IActionResult FromResult<T>(Result<T> result, bool created = false)
    {
        return result.Status switch
        {
            ResultStatus.NotFound => Problem(statusCode: 404, title: result.Message),
            ResultStatus.Conflict => Problem(statusCode: 409, title: result.Message),
            ResultStatus.BadRequest => Problem(statusCode: 400, title: result.Message),
            ResultStatus.Unavailable => Problem(statusCode: 503, title: result.Message),
            _ => created ? StatusCode(StatusCodes.Status201Created, result.Value) : Ok(result.Value)
        };
    }

    // For DELETE: 204 with no body on success.
    protected IActionResult NoContentFromResult<T>(Result<T> result)
    {
        return result.Status == ResultStatus.Success ? NoContent() : FromResult(result);
    }
}
