namespace AeroSentry.Api.Data.Entities;

public class User
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNumber {get; set;} = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "Admin";  
    public bool IsActive { get; set; } = true;    
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // For guards: the Admin who created (owns) this guard. Null for Admins.
    public Guid? OwnerAdminId { get; set; }
}