namespace AeroSentry.Api.Data.Entities;

// A person whose face is whitelisted for one property (a resident, an employee or a visitor).
// Faces are biometric data: only admins can see them, and "remove person" deletes the photos and the numbers for good.
public class AuthorizedPerson
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }
    public Property Property { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }

    // "Resident", "Employee" or "Visitor" (see PersonCategory)
    public string Category { get; set; } = PersonCategory.Visitor;

    // Last day the person is authorized (inclusive). Null = no expiry.
    public DateOnly? ValidUntil { get; set; }

    // The admin can switch access off without deleting the person ("Disable access").
    public bool AccessDisabled { get; set; }

    public string? Note { get; set; }
    public DateTime EnrolledAtUtc { get; set; } = DateTime.UtcNow;

    // The face of this person as 512 numbers of length 1: the average of the three photos' faces (4 bytes per number).
    // A live face is compared with this one (cosine similarity = dot product), exactly like the learning scripts do.
    public byte[] MeanEmbedding { get; set; } = Array.Empty<byte>();

    public List<PersonPhoto> Photos { get; set; } = new();
}

public class PersonPhoto
{
    public Guid Id { get; set; }

    public Guid PersonId { get; set; }
    public AuthorizedPerson Person { get; set; } = null!;

    // "Front", "Left" or "Right"
    public string Angle { get; set; } = string.Empty;

    public string ContentType { get; set; } = "image/jpeg";
    public byte[] Image { get; set; } = Array.Empty<byte>();

    // This photo's own face, 512 numbers of length 1 (4 bytes each).
    public byte[] Embedding { get; set; } = Array.Empty<byte>();

    // Width in pixels of the face in the photo (a small face makes a weak embedding).
    public int FaceWidth { get; set; }
}

public static class PersonCategory
{
    public const string Resident = "Resident";
    public const string Employee = "Employee";
    public const string Visitor = "Visitor";
    public static readonly string[] All = { Resident, Employee, Visitor };
}

public static class PersonAngle
{
    public const string Front = "Front";
    public const string Left = "Left";
    public const string Right = "Right";
    public const string Up = "Up";
    public const string Down = "Down";
    // The three pictures every person has (what photoAngles lists).
    public static readonly string[] All = { Front, Left, Right };
    // A video enrolment may also give an Up and a Down picture. They are stored and can be fetched with get-photo.
    public static readonly string[] Extra = { Up, Down };
    public static readonly string[] Any = { Front, Left, Right, Up, Down };

    // An enrolment from a video (like enroll_user.py) stores its 30 frames as "Frame01" ... "Frame30" instead.
    public static string Frame(int number) => $"Frame{number:00}";
    public static bool IsFrame(string angle) =>
        angle.Length == 7 && angle.StartsWith("Frame", StringComparison.Ordinal) && char.IsDigit(angle[5]) && char.IsDigit(angle[6]);
}

// Shown in the app. Worked out from AccessDisabled and ValidUntil, never stored.
public static class PersonStatus
{
    public const string Authorized = "Authorized";
    public const string Disabled = "Disabled";
    public const string Expired = "Expired";
}
