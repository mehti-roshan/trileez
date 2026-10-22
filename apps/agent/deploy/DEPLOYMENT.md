# Trilez Agent deployment

The Windows employee agent is a per-user, framework-dependent .NET 8 WPF application. Version 0.2.0. It does not install a Windows service, a scheduled task, or a machine-wide startup entry, and it does not download updates.

Linux developers build and run `Trilez.Agent.Avalonia` from `apps/agent`. That project is the cross-platform employee desktop. The WPF project stays in the solution until Avalonia has been executed on Windows. Linux restore/build/test/run commands are in `apps/agent/README.md` and `apps/agent/scripts/linux/dev.sh`. A Linux `dotnet publish -r win-x64` of Avalonia is a compile of the Windows RID, not a Windows runtime test.

## Supported Windows versions

- Windows 10 version 1607 (build 14393) or later, 64-bit
- Windows 11, 64-bit

Windows 7, Windows 8.1, 32-bit Windows, and ARM64 are not supported. The publish runtime identifier is `win-x64`. The desktop runtime is `net8.0-windows`. Official .NET 8 desktop support starts at Windows 10 version 1607.

The installer reads `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\CurrentBuild` and requires a build of at least 14393. It also requires `PROCESSOR_ARCHITECTURE` to be `AMD64`. It does not trust `Environment.OSVersion`, which can report an older version.

## Prerequisites

Install the Microsoft .NET 8 Desktop Runtime (x64) from Microsoft before installing the agent. The base runtime and the ASP.NET runtime are not enough. The installer looks for a `8.*` folder under `%ProgramFiles%\dotnet\shared\Microsoft.WindowsDesktop.App`, and otherwise for a `Microsoft.WindowsDesktop.App 8.` line from `dotnet --list-runtimes`.

Run the installer as the employee. An elevated window is refused, so program files are not created with administrator ownership.

## Publish

On a Windows build machine, from `apps/agent/deploy`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Publish-TrilezAgent.ps1
```

That runs:

```text
dotnet publish src/Trilez.Agent.Desktop/Trilez.Agent.Desktop.csproj -c Release -r win-x64 --self-contained false
```

The executable is `Trilez.Agent.Desktop.exe`. The script writes `manifest.json` beside the published files. The manifest product is `Trilez.Agent`, the runtime is `net8.0-windows`, the rid is `win-x64`, and every other file has a SHA-256 hash. The manifest itself is not a payload file. Copy that directory, or a zip of it, to the employee PC. Do not point the agent at an update URL.

## Install

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-TrilezAgent.ps1 -Package C:\Temp\TrilezAgent
```

`-Package` is a local directory that contains `manifest.json`, or a local zip whose root (or single top folder) contains it. A path with `://` is rejected.

The installer verifies the product, runtime, rid, three-part version, relative paths, and SHA-256 of every listed file. `..`, empty segments, drive letters, and leading slashes are rejected. A hash mismatch stops the install and leaves the previous program files in place.

Program files:

```text
%LOCALAPPDATA%\Programs\Trilez Agent\current
%LOCALAPPDATA%\Programs\Trilez Agent\previous
%LOCALAPPDATA%\Programs\Trilez Agent\Uninstall-TrilezAgent.ps1
```

User data stays separate:

```text
%APPDATA%\Trilez\agent-settings.json
%APPDATA%\Trilez\device-credential.json
%APPDATA%\Trilez\usage-queue.json
%APPDATA%\Trilez\health-queue.json
%APPDATA%\Trilez\agent.lock
%APPDATA%\Trilez\logs\agent.log
%APPDATA%\Trilez\logs\agent.log.1
```

When `ApplicationData` is empty, the agent falls back to `%USERPROFILE%\.trilez`. Settings and the device credential are not stored under the program directory, so an upgrade does not rewrite them.

The installer registers Apps & features for the current user at `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Trilez Agent` with the manifest version, the install location, and an uninstall command. `NoModify` and `NoRepair` are set. Repair and rollback are explicit script switches, not Apps & features buttons.

A second copy of the running agent exits. The lock is an open file, `agent.lock`, not a leftover file from a crash. The window title includes version 0.2.0.

## Startup

Startup is off unless the employee or the operator turns it on. The only mechanism is the visible per-user value `Trilez Agent` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Task Manager shows it under Startup apps. The value is the quoted path of `Trilez.Agent.Desktop.exe`.

Pass `-StartWithWindows` on install, upgrade, or repair to turn that value on. Without the switch, the installer does not change the Run key or the settings file.

On a first install, the switch also writes `install-flags.json` next to the executable. The app applies that flag only when `agent-settings.json` does not exist yet, then deletes the flag. If settings already exist, the flag is ignored and deleted so an upgrade cannot turn startup back on after the employee turned it off.

When settings already exist and the operator passes `-StartWithWindows`, the script changes only the `startWithWindows` field. It does not reserialize the file, so the API address and the last sync time stay as written.

In the app, Settings has the checkbox «با روشن شدن ویندوز، تری‌لیز باز شود. این گزینه در برنامه‌های شروع ویندوز دیده می‌شود.» Saving settings with the box cleared removes the Run value. Saving with it checked adds the value. A bad API address does not change startup.

The app enables the Run value at launch only when the saved setting is true. It does not clear a Run value on every launch.

## Configuration and credentials

`agent-settings.json` stores the API origin, the last successful sync time, and `startWithWindows`. It does not store the password, the access token, screen frames, or the device secret.

The device secret is stored in `device-credential.json` as DPAPI data for the current user (`DataProtectionScope.CurrentUser`). The app does not identify the device by Windows user name or MAC address. Sign-out and shutdown keep the installation id and the device secret. Unregister removes the local credential only after the server confirms the device is revoked.

The API address is an `http` or `https` origin without user information in the URL.

## Connection and enrollment

The window shows connection and enrollment separately.

- Connection: متصل, آفلاین, نشست منقضی شده, اجازه دسترسی نیست, or وارد نشده.
- Enrollment: ثبت‌شده, غیرفعال, لغو‌شده, or ثبت‌نشده.
- Device connection: آنلاین or آفلاین.

Diagnostics also show the agent version, whether startup is on, and, while signed in, the enrollment labels. They do not show the raw API URL, session ids, or secrets.

A transient failure (network error, HTTP 503, or another non-auth error) marks the device offline, keeps the credential and installation id, and leaves the heartbeat running so the next minute retries. Recovery is logged once. Successful heartbeats are not logged every time.

`DEVICE_REVOKED` marks the device لغو‌شده, stops collectors, and keeps the secret. The agent does not register again until the employee enrolls again. That explicit enroll uses a new installation id and makes one registration call. A revoked response is not retried automatically. An installation conflict is retried once with a new id; if that retry is revoked, there is no third attempt.

An expired or revoked user session drops the in-memory sign-in and asks the employee to sign in again. The device credential stays. A rejected device credential does not refresh the user token and does not clear it.

## Logs

Logs are `%APPDATA%\Trilez\logs\agent.log`, with one backup `agent.log.1` at about 512 KB. Lines are capped and redacted. Bearer tokens, JWTs, passwords, secrets, device credentials, and URL user information are removed. The log records status and code for sign-in failure, session expiry, revocation, and offline heartbeats. It does not record request bodies, the employee email, or the device secret.

The unexpected-error dialog says «خطای غیرمنتظره رخ داد. جزئیات حساس نمایش داده نمی‌شود.» The log gets the exception type and a redacted message, not a raw stack.

## Upgrade

Place the new local package and run the installer again without `-Repair`. The package must be newer (three numeric parts; `0.10.0` is newer than `0.9.0`). The installer verifies hashes, moves `current` to `previous`, and copies the new files. If the copy fails, it moves `previous` back. The same version is left untouched unless `-Repair` is passed. An older package is not installed over the current one.

User settings and the device credential are not rewritten by an upgrade. `-StartWithWindows` is the only switch that changes startup, and only because it was passed.

## Rollback

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-TrilezAgent.ps1 -Rollback
```

Rollback verifies the previous directory’s manifest and hashes, then swaps `current` and `previous`. It does not accept `-StartWithWindows` and does not change user data. If the previous files were modified, rollback stops and leaves the current version in place. Rolling back again returns to the version that was just replaced.

## Repair

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-TrilezAgent.ps1 -Package C:\Temp\TrilezAgent -Repair
```

Repair replaces the installed files with the same version after the hashes match. It does not replace a different version and does not discard `previous`.

## Removal

From the install folder, or from the copy under `%LOCALAPPDATA%\Programs\Trilez Agent`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Uninstall-TrilezAgent.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Uninstall-TrilezAgent.ps1 -KeepData
```

Apps & features runs the same script. Removal deletes `current`, `previous`, the uninstall script, the HKCU Run value when it points at `Trilez.Agent.Desktop.exe`, and the HKCU uninstall key.

Without `-KeepData` it also deletes only these names under `%APPDATA%\Trilez`: the settings file, the device credential, the usage queue, the health queue, the lock file, install flags, their `.tmp` siblings, and `logs\agent.log` plus `logs\agent.log.1`. Other files, such as a note the employee saved in that folder, are left in place. The folder is removed only when it is empty. Links are removed as links and are not followed. Documents and other AppData folders are not deleted.

`-KeepData` leaves settings and the credential so a later install can see `startWithWindows`. The program files and the Run value are still removed. The next launch applies startup only if the saved setting is still true.

Close the agent before uninstalling. The script does not terminate the process.

## Troubleshooting

- The window says the agent is already running: another `Trilez.Agent.Desktop.exe` has `agent.lock`. Close that window. A lock file left after a crash does not, by itself, block the next start.
- The device stays آفلاین: the API was unreachable or returned a server error. The credential is kept and the heartbeat retries. Check the API origin in Settings and the redacted log.
- Enrollment says لغو‌شده: an administrator revoked the device. The agent will not register again until the employee enrolls again from the device page.
- The session says نشست منقضی شده: sign in again. The device credential is still there.
- Startup did not turn on: the checkbox is off unless it was saved or `-StartWithWindows` was passed. Confirm the Run value in Task Manager. The installer will not recreate it on a later upgrade unless the switch is passed again or the saved setting is on.
- Hash or path errors: do not use the package. Publish again and copy the new folder. The installer will not copy a file whose hash changed after the manifest was written.
- The desktop runtime is missing: install the .NET 8 Desktop Runtime x64 and run the installer again. The agent is not self-contained.

## Verification

Tested on Linux with the .NET 8 SDK, against temporary directories:

- SHA-256 match, a tampered file does not install, and `../` or an absolute path is rejected
- Version comparison, including `0.2.0` then `0.2.1`, and `0.10.0` versus `0.9.0`
- Upgrade and rollback preserve the exact settings and credential bytes
- A failed previous manifest does not replace the current files
- Repair replaces only the same version
- Uninstall removes `current`, `previous`, and known Trilez files, leaves an unrelated note and a sibling folder, and does not follow a logs link or a payload link onto an outside file
- `-KeepData` leaves the credential file
- The instance lock rejects a second open and can be acquired again after dispose
- Diagnostic lines redact bearer tokens, JWTs, passwords, URL user information, and device credentials, and the log rotates
- The startup flag survives sign-in and refresh and is not applied when the API address is rejected
- First-run flags do not overwrite an existing settings file
- A heartbeat outage keeps the installation and retries without registering again
- A revoked registration is not retried, a later sign-in does not register, and an explicit enroll registers once
- An installation conflict retries once; a revoked response on that retry does not try a third time

Not verified on Windows, because this environment cannot run WPF, MSI, the PowerShell installer, the registry, DPAPI, or Windows capture:

- `Install-TrilezAgent.ps1`, `Uninstall-TrilezAgent.ps1`, and `Publish-TrilezAgent.ps1`
- The HKCU Run value and the Apps & features uninstall key
- Elevation refusal, the Windows build check, and the desktop-runtime check
- Launching the WPF window, the startup checkbox, sign-in through the window, process restart, and shutdown
- DPAPI protection of the device secret
- Real screen capture

Do not treat the Linux tests as a Windows installation test.
