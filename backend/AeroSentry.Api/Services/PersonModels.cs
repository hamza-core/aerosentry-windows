using AeroSentry.Api.DTOs;
using AeroSentry.Api.Services.Interfaces;

namespace AeroSentry.Api.Services;

// The small data types used with IPersonService. (The interface itself is in Interfaces/IPersonService.cs.)

// A photo as it arrives from the app.
public record PhotoUpload(byte[] Bytes, string ContentType);

// A person in a picture, as the wall model reports it: a track id (stable while the person stays in view) and a box
// [x1, y1, x2, y2] as fractions of the picture.
public record TrackBox(int TrackId, double[] Box);

// One camera picture with the people the wall model found in it.
public record RecognitionFrame(byte[] Jpeg, IReadOnlyList<TrackBox> People);

// Person = the trusted authorized person for the alarm's target (null if none). AllCleared = everyone at the wall is trusted.
public record AlarmRecognition(RecognizedPersonDto? Person, bool AllCleared);
