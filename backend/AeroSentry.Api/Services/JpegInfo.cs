namespace AeroSentry.Api.Services;

// Reads the width and height of a JPEG from its header, without any image library.
// A JPEG is a list of segments: FF <marker> <length> <data>. The "start of frame" segment (SOF)
// holds the size: FF Cx, length(2), precision(1), HEIGHT(2), WIDTH(2).
public static class JpegInfo
{
    public static bool TryReadSize(byte[] data, out int width, out int height)
    {
        width = height = 0;

        // Every JPEG starts with FF D8.
        if (data.Length < 4 || data[0] != 0xFF || data[1] != 0xD8)
            return false;

        var i = 2;
        while (i + 9 < data.Length)
        {
            if (data[i] != 0xFF)
            {
                i++;
                continue;
            }

            var marker = data[i + 1];
            if (marker == 0xFF)   // padding byte
            {
                i++;
                continue;
            }

            // SOF0..SOF15, except C4 (huffman tables), C8 (reserved) and CC (arithmetic conditioning).
            var isStartOfFrame = marker is >= 0xC0 and <= 0xCF && marker is not (0xC4 or 0xC8 or 0xCC);
            if (isStartOfFrame)
            {
                height = (data[i + 5] << 8) | data[i + 6];
                width = (data[i + 7] << 8) | data[i + 8];
                return width > 0 && height > 0;
            }

            // Any other segment: skip it using its length (the 2 bytes after the marker, counting themselves).
            var length = (data[i + 2] << 8) | data[i + 3];
            i += 2 + length;
        }

        return false;
    }
}
