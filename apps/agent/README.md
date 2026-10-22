# Trilez employee agent

Cross-platform .NET 8 employee desktop for Trilez. Version `0.2.0`.

## Real implementation directory

The working copy that contains this agent is:

```text
/home/mehti/Desktop/trileez/apps/agent
```

This directory is in the main Trilez repository. A recoverable source snapshot of the integration is at `/home/mehti/.grok/backups/trileez-agent-2026-10-20`.

Solution: `apps/agent/Trilez.Agent.sln`

| Project | Role |
| --- | --- |
| `Trilez.Agent.Core` | API client, dashboard loaders, models. No UI. |
| `Trilez.Agent.Presentation` | `ShellViewModel`, workspace, auth session, Linux platform services |
| `Trilez.Agent.Avalonia` | Cross-platform Persian RTL employee desktop |
| `Trilez.Agent.Desktop` | Original WPF shell. Preserved. Linux builds an empty stub. |
| `Trilez.Agent.Cli` | One-shot dashboard print |
| `*.Tests` | Unit tests for core, presentation, and Avalonia converters |

The Avalonia app is the Linux desktop. Keep the WPF project until the Avalonia app has been run and checked on Windows.

## Linux restore, build, and run

SDK 8 is required. This machine uses `/home/mehti/.dotnet/dotnet` when `dotnet` is not on `PATH`.

```bash
cd apps/agent
export DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"
chmod +x scripts/linux/dev.sh
./scripts/linux/dev.sh all
./scripts/linux/dev.sh run
```

Makefile equivalents from `apps/agent`:

```bash
make restore
make build-core
make build
make test
make run
make check-deps
```

If restore times out downloading SkiaSharp native assets, retry with HTTP/1.1:

```bash
export DOTNET_SYSTEM_NET_HTTP_SOCKETSHTTPHANDLER_HTTP2SUPPORT=false
./scripts/linux/dev.sh restore
```

If the SDK is missing:

```bash
curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0
export DOTNET="$HOME/.dotnet/dotnet"
export PATH="$HOME/.dotnet:$PATH"
```

Avalonia on Linux needs a working display server (X11 or Wayland) and the usual Skia native dependencies shipped with the `Avalonia.Desktop` package. If the window does not start, install distribution packages for `libice6`, `libsm6`, `libfontconfig1`, and a Persian-capable font such as `fonts-noto-naskh-arabic` or Vazirmatn.

## API URL

Type the API origin in the login form. For the Docker Compose panel on this machine that is `http://127.0.0.1` (port 80). Nginx serves the web app and proxies `/api/` to the Express process. Do not use port 4000; that port is inside the Compose network and is not published. Do not put `/api`, an email, or a password in the URL.

The last origin is stored in `~/.config/Trilez/agent-settings.json` (`ApiBaseUrl` only). Passwords and access tokens are not written to disk.

The CLI still uses environment variables and never stores them:

```bash
export TRILEZ_API_BASE=http://127.0.0.1
export TRILEZ_EMAIL=you@company.example
export TRILEZ_PASSWORD
"$DOTNET" run --project src/Trilez.Agent.Cli -c Release
```

Do not commit `.env` files, tokens, or production URLs.

## Tests

```bash
./scripts/linux/dev.sh test
```

Core and presentation tests are the contract for login, refresh, tasks, projects, meetings, notifications, enrollment, and honest unavailable snapshots. They do not start the window.

Live login against a running Trilez API is a manual step in the Avalonia window. If the API is down, the form shows the Persian connection error from the existing client. There is no mock-data fallback.

## Windows application

Avalonia targets `net8.0` and can be published for Windows from Linux:

```bash
./scripts/linux/dev.sh publish-win
```

That command compiles `win-x64`. It is not a runtime test. Run `Trilez.Agent.Avalonia.exe` on Windows 10/11 x64 before treating Windows as verified.

The WPF app still publishes only on a Windows machine with the .NET 8 Desktop runtime pack (`Microsoft.WindowsDesktop.App`). See `deploy/DEPLOYMENT.md`. Linux cannot run or fully publish the WPF project.

## Feature matrix

| Capability | Linux Avalonia | Windows Avalonia (compiled, not runtime-tested here) | WPF |
| --- | --- | --- | --- |
| Login, refresh, logout, token refresh | Yes | Yes | Yes |
| Employee profile, tasks, projects, attendance, work logs, meetings, notifications | Yes | Yes | Yes |
| Persian RTL dashboard | Yes | Yes | Yes |
| Device enrollment / unregister | Yes | Yes | Yes |
| Health samples (CPU, memory, disk, OS) | Yes (`/proc`) | Yes (Windows APIs) | Yes |
| Credential protection | AES-GCM key file `~/.config/Trilez/device-protect.key` | DPAPI | DPAPI |
| Visible user startup | XDG autostart `~/.config/autostart/trileez-agent.desktop` | HKCU Run | HKCU Run |
| Foreground application sampling | Unsupported (honest unavailable) | Windows probe | Windows probe |
| Usage session lock/suspend signals | Unsupported | Windows `SystemEvents` | Windows `SystemEvents` |
| Screen viewing after employee accept | Unsupported (no frames) | GDI capture | GDI capture |
| Remote input / control plane | Never applied | Never applied | Never applied |

Unsupported capabilities return the existing Persian unavailable snapshots. The UI does not invent telemetry or screen frames.

Password change is not implemented in the desktop. The app tells the employee to change the password in the Trilez panel.

## Still requires Windows validation

- Avalonia window layout, fonts, and DPI on Windows
- DPAPI credential round-trip
- HKCU startup registration visibility in Task Manager
- Foreground probe, usage signals, and accepted screen-share capture
- WPF installer scripts in `deploy/`

Do not treat a Linux `win-x64` publish as a successful Windows run.
