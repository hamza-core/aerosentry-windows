using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

public class UpdateGuardStatusRequest
{
    [Required]
    [AllowedValues("Active", "Suspended")]
    public string Status { get; set; } = string.Empty;
}
