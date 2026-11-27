using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

public class RegisterRequest
{
    [Required, StringLength(100)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(256)]
    public string Email { get; set; } = string.Empty;

    public string PhoneNumber {get;set;} = string.Empty;

    [Required, StringLength(100, MinimumLength = 8)]
    public string Password { get; set; } = string.Empty;
}