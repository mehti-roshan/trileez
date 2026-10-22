using System.Windows;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private ShellViewModel? Model => DataContext as ShellViewModel;

    private async void SignIn_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        var password = PasswordInput.Password;
        PasswordInput.Clear();
        await Model.SignInAsync(password);
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.RefreshAsync();
    }

    private async void SignOut_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.SignOutAsync();
    }

    private async void SubmitTime_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.SubmitTimeAsync();
    }

    private async void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.SavePreferencesAsync();
    }

    private async void EnrollDevice_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.EnrollDeviceAsync();
    }

    private async void UnregisterDevice_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.UnregisterDeviceAsync();
    }

    private async void PauseUsage_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.PauseUsageAsync();
    }

    private async void ResumeUsage_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.ResumeUsageAsync();
    }

    private async void AcceptScreenShare_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.AcceptScreenShareAsync();
    }

    private async void StopScreenShare_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.StopScreenShareAsync();
    }

    private async void GrantScreenControl_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.GrantScreenControlAsync();
    }

    private async void DenyScreenControl_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.DenyScreenControlAsync();
    }

    private async void RevokeScreenControl_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        await Model.RevokeScreenControlAsync();
    }
}
