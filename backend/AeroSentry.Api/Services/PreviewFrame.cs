namespace AeroSentry.Api.Services;

// One picture of the live preview. Sequence grows with every new picture, so a viewer can tell if it has seen it.
public record PreviewFrame(byte[] Jpeg, long Sequence, DateTime AtUtc);
