using System.Globalization;
using Trilez.Agent.AvaloniaApp;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Avalonia.Tests;

public sealed class ConverterTests
{
    private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;

    [Fact]
    public void InverseBoolConverter_flips_boolean()
    {
        var converter = new InverseBoolConverter();
        Assert.Equal(false, converter.Convert(true, typeof(bool), null, Culture));
        Assert.Equal(true, converter.Convert(false, typeof(bool), null, Culture));
        Assert.Equal(true, converter.Convert(null, typeof(bool), null, Culture));
    }

    [Theory]
    [InlineData("text", true)]
    [InlineData("  ", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void StringHasValueConverter_detects_text(string? value, bool expected)
    {
        var converter = new StringHasValueConverter();
        Assert.Equal(expected, converter.Convert(value, typeof(bool), null, Culture));
    }

    [Fact]
    public void PageIsConverter_matches_named_page()
    {
        var converter = new PageIsConverter();
        Assert.Equal(true, converter.Convert(AppPage.Tasks, typeof(bool), "Tasks", Culture));
        Assert.Equal(false, converter.Convert(AppPage.Tasks, typeof(bool), "Overview", Culture));
        Assert.Equal(false, converter.Convert(AppPage.Tasks, typeof(bool), "not-a-page", Culture));
    }
}
