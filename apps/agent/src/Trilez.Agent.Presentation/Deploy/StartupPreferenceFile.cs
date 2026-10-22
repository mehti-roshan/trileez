using System.Text.RegularExpressions;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Turns startup on inside an existing settings file without reserializing the rest of the JSON.
/// </summary>
public static class StartupPreferenceFile
{
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(100);

    public static string Enable(string json)
    {
        if (json is null) throw new ArgumentNullException(nameof(json));
        var property = new Regex(@"""startWithWindows""\s*:\s*(true|false)", RegexOptions.IgnoreCase, Timeout);
        if (property.IsMatch(json))
            return property.Replace(json, @"""startWithWindows"": true", 1);
        var close = json.LastIndexOf('}');
        if (close < 0) throw new InvalidDataException("Settings file has no object to update.");
        var body = json[..close].TrimEnd();
        var comma = body.Length > 0 && body[^1] != '{' ? "," : "";
        return json[..close].TrimEnd() + comma + "\n  \"startWithWindows\": true\n" + json[close..];
    }
}
