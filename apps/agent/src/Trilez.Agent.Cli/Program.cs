using Trilez.Agent;

var baseUrl = Environment.GetEnvironmentVariable("TRILEZ_API_BASE");
var email = Environment.GetEnvironmentVariable("TRILEZ_EMAIL");
var password = Environment.GetEnvironmentVariable("TRILEZ_PASSWORD");
if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password))
{
    Console.Error.WriteLine("TRILEZ_API_BASE، TRILEZ_EMAIL و TRILEZ_PASSWORD را تنظیم کنید. نشانی باید مبدأ API باشد، نه یک مسیر سخت‌کدشده.");
    return 2;
}

try
{
    var session = new SessionState();
    var api = TrilezApiClient.Create(baseUrl, session);
    await api.LoginAsync(email, password);
    var dashboard = await new EmployeeDashboardService(api).LoadAsync();
    Console.WriteLine(DashboardText.Format(dashboard));
    return dashboard.PasswordChangeRequired ? 3 : 0;
}
catch (TrilezApiException error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}
catch (ArgumentException)
{
    Console.Error.WriteLine("نشانی API معتبر نیست. مبدأ http یا https را بدون نام کاربری و رمز در نشانی وارد کنید.");
    return 2;
}
