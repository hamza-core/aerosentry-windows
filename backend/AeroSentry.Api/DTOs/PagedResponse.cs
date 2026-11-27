namespace AeroSentry.Api.DTOs;

// The one pagination format of the API: ?page=1&pageSize=20 in, this out.
public class PagedResponse<T>
{
    public List<T> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
}
