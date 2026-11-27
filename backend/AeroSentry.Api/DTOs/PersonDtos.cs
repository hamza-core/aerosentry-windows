using System.ComponentModel.DataAnnotations;

namespace AeroSentry.Api.DTOs;

// multipart/form-data body of POST people/enroll (the face photos are files, so it is not JSON)
public class EnrollPersonRequest
{
    [Required, StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(30)]
    public string? Phone { get; set; }

    // "Resident", "Employee" or "Visitor"
    [Required, RegularExpression("^(Resident|Employee|Visitor)$")]
    public string Category { get; set; } = string.Empty;

    // Last day the person is authorized, like 2026-10-31. Leave out for no expiry.
    public DateOnly? ValidUntil { get; set; }

    [StringLength(500)]
    public string? Note { get; set; }

    // Three pictures of the same person, each showing exactly one face.
    [Required] public IFormFile Front { get; set; } = null!;
    [Required] public IFormFile Left { get; set; } = null!;
    [Required] public IFormFile Right { get; set; } = null!;
}

// multipart/form-data body of POST people/enroll-video: the same details, and ONE video instead of three pictures.
public class EnrollPersonVideoRequest
{
    [Required, StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(30)]
    public string? Phone { get; set; }

    // "Resident", "Employee" or "Visitor"
    [Required, RegularExpression("^(Resident|Employee|Visitor)$")]
    public string Category { get; set; } = string.Empty;

    // Last day the person is authorized, like 2026-10-31. Leave out for no expiry.
    public DateOnly? ValidUntil { get; set; }

    [StringLength(500)]
    public string? Note { get; set; }

    // A 10 to 20 second video of ONE person asked to look straight, turn left, turn right, tilt up and tilt down.
    [Required] public IFormFile Video { get; set; } = null!;
}

// The same details, with the pictures of the live capture screen instead of a video.
public class EnrollPersonImagesRequest
{
    [Required, StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(30)]
    public string? Phone { get; set; }

    [Required, RegularExpression("^(Resident|Employee|Visitor)$")]
    public string Category { get; set; } = string.Empty;

    public DateOnly? ValidUntil { get; set; }

    [StringLength(500)]
    public string? Note { get; set; }

    // The captured pictures (30 to 60).
    [Required] public List<IFormFile> Frames { get; set; } = new();
}

// JSON body of PUT people/update: the details only (to change the photos, remove the person and enrol again).
public class UpdatePersonRequest
{
    [Required, StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(30)]
    public string? Phone { get; set; }

    [Required, RegularExpression("^(Resident|Employee|Visitor)$")]
    public string Category { get; set; } = string.Empty;

    public DateOnly? ValidUntil { get; set; }

    [StringLength(500)]
    public string? Note { get; set; }
}

public class PersonResponse
{
    public Guid Id { get; set; }
    public Guid PropertyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string Category { get; set; } = string.Empty;
    public DateOnly? ValidUntil { get; set; }
    public string? Note { get; set; }

    // "Authorized", "Disabled" (access switched off) or "Expired" (past ValidUntil)
    public string Status { get; set; } = string.Empty;
    public bool AccessDisabled { get; set; }
    public DateTime EnrolledAtUtc { get; set; }

    // Get a picture with people/get-photo?...&angle=Front|Left|Right
    public List<string> PhotoAngles { get; set; } = new();
}

// Who a recognised face is. Also attached to an alert when the person at the wall was recognised.
public class RecognizedPersonDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;

    // How alike the faces are, 0 to 1 (1 = identical). A match needs at least Face:MatchThreshold.
    public double Score { get; set; }
}

// Answer of people/check-photo: is this picture good enough to enrol with?
public class PhotoCheckResponse
{
    public bool Ok { get; set; }
    public int FaceCount { get; set; }
    public int FaceWidth { get; set; }
    public string Message { get; set; } = string.Empty;
}

// Answer of people/identify: every face in the picture and who it looks like.
public class IdentifyResponse
{
    public int FaceCount { get; set; }
    public List<IdentifiedFaceDto> Faces { get; set; } = new();
}

public class IdentifiedFaceDto
{
    // [x1, y1, x2, y2] in pixels of the picture
    public int[] Box { get; set; } = Array.Empty<int>();
    public int FaceWidth { get; set; }
    public double DetectionScore { get; set; }

    // Highest similarity to any enrolled person (even below the threshold), and the match if it reaches it.
    public double BestScore { get; set; }
    public bool Matched { get; set; }
    public PersonResponse? Person { get; set; }

    // Matched AND the person's status is Authorized (not disabled, not expired).
    public bool IsAuthorized { get; set; }
}
