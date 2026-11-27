namespace AeroSentry.Api.Services;

// The little maths of face matching. A face is 512 numbers of length 1; two faces are alike when their
// dot product (the cosine similarity) is high: about 1.0 for the same face, near 0 for different people.
public static class FaceMath
{
    public static float Dot(float[] a, float[] b)
    {
        var sum = 0f;
        for (var i = 0; i < a.Length; i++)
            sum += a[i] * b[i];
        return sum;
    }

    // Average several faces, then scale the result back to length 1 (ArcFace needs length 1 for the dot product to be a cosine).
    public static float[] MeanNormalized(IReadOnlyList<float[]> vectors)
    {
        var mean = new float[vectors[0].Length];
        foreach (var v in vectors)
            for (var i = 0; i < mean.Length; i++)
                mean[i] += v[i];

        var length = MathF.Sqrt(mean.Sum(x => x * x));
        for (var i = 0; i < mean.Length; i++)
            mean[i] /= length;
        return mean;
    }

    // Stored in the database as bytes (4 per number).
    public static byte[] ToBytes(float[] vector)
    {
        var bytes = new byte[vector.Length * sizeof(float)];
        Buffer.BlockCopy(vector, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    public static float[] FromBytes(byte[] bytes)
    {
        var vector = new float[bytes.Length / sizeof(float)];
        Buffer.BlockCopy(bytes, 0, vector, 0, bytes.Length);
        return vector;
    }
}
