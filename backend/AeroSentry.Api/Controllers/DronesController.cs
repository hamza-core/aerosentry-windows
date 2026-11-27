using Microsoft.AspNetCore.Mvc;

namespace AeroSentry.Api.Controllers;

// PLANNED, NOT IMPLEMENTED YET (Feature 8: drone).
// Every function here answers 501 Not Implemented. They exist so the app teams can see the planned
// function names and show a "not available yet" state. Names and parameters may still change.
// How the backend talks to the Raspberry Pi is not decided yet: see docs/FUTURE-WORK.md.
[Route("api/v1/drones")]
public class DronesController : ApiControllerBase
{
    private IActionResult NotYet() => Problem(
        statusCode: StatusCodes.Status501NotImplemented,
        title: "Drone control is not implemented yet",
        detail: "Planned for later, when the drone hardware is stable. See docs/FUTURE-WORK.md.");

    // ---- registry ----

    // GET /api/v1/drones/list?propertyId=...
    [HttpGet("list")]
    public IActionResult List(Guid propertyId) => NotYet();

    // POST /api/v1/drones/create?propertyId=...      (Admin)
    [HttpPost("create")]
    public IActionResult Create(Guid propertyId) => NotYet();

    // DELETE /api/v1/drones/delete?propertyId=...&droneId=...      (Admin)
    [HttpDelete("delete")]
    public IActionResult Delete(Guid propertyId, Guid droneId) => NotYet();

    // ---- missions ----

    // POST /api/v1/drones/dispatch?alertId=...       send a drone to the alert's grid cell
    [HttpPost("dispatch")]
    public IActionResult Dispatch(Guid alertId) => NotYet();

    // GET /api/v1/drones/get-status?propertyId=...&droneId=...    live status of one drone
    [HttpGet("get-status")]
    public IActionResult GetStatus(Guid propertyId, Guid droneId) => NotYet();

    // GET /api/v1/drones/list-flight-logs?propertyId=...&droneId=...
    [HttpGet("list-flight-logs")]
    public IActionResult ListFlightLogs(Guid propertyId, Guid droneId) => NotYet();

    // ---- commands ----

    // POST /api/v1/drones/return-home?propertyId=...&droneId=...
    [HttpPost("return-home")]
    public IActionResult ReturnHome(Guid propertyId, Guid droneId) => NotYet();

    // POST /api/v1/drones/emergency-land?propertyId=...&droneId=...
    [HttpPost("emergency-land")]
    public IActionResult EmergencyLand(Guid propertyId, Guid droneId) => NotYet();

    // POST /api/v1/drones/take-manual-control?propertyId=...&droneId=...    pauses autonomous flight
    [HttpPost("take-manual-control")]
    public IActionResult TakeManualControl(Guid propertyId, Guid droneId) => NotYet();

    // POST /api/v1/drones/send-controls?propertyId=...&droneId=...    joystick values while in manual control
    [HttpPost("send-controls")]
    public IActionResult SendControls(Guid propertyId, Guid droneId) => NotYet();

    // POST /api/v1/drones/release-manual-control?propertyId=...&droneId=...    resume the mission
    [HttpPost("release-manual-control")]
    public IActionResult ReleaseManualControl(Guid propertyId, Guid droneId) => NotYet();
}
