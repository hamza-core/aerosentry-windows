using AeroSentry.Api.Services;
using AeroSentry.Api.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

[Route("api/v1/ml")]
public class MlController : ApiControllerBase
{
    private readonly IMlClient _ml;

    public MlController(IMlClient ml)
    {
        _ml = ml;
    }

    // Is the ML service running and are its models loaded? Handy before a demo. Always 200.
    [HttpGet("health")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Health() => Ok(await _ml.HealthAsync());
}
