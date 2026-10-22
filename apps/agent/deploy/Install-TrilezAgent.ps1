#Requires -Version 5.1
<#
.SYNOPSIS
  Installs, upgrades, repairs, or rolls back the per-user Trilez Agent.

.DESCRIPTION
  The package must already be on this computer. This script does not download updates.
  It refuses to run elevated. It does not install a service, a scheduled task, or a machine-wide startup entry.
  File layout and hash rules match Trilez.Agent.Presentation.DeploymentLayout and PackageIntegrity.
#>
[CmdletBinding()]
param(
    [string]$Package,
    [switch]$StartWithWindows,
    [switch]$Repair,
    [switch]$Rollback
)

$ErrorActionPreference = 'Stop'
if ($Rollback -and $StartWithWindows) {
    throw "Rollback does not change startup settings. Run rollback on its own."
}
if ($Rollback -and $Repair) {
    throw "Choose either repair or rollback."
}

function Assert-NotElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Trilez Agent installs for the current user only. Close this elevated window and run the installer without administrator privileges."
    }
}

function Assert-SupportedWindows {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw "Trilez Agent requires 64-bit Windows (win-x64). 32-bit and ARM64 builds are not published."
    }
    $buildText = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuild
    $build = 0
    if (-not [int]::TryParse($buildText, [ref]$build) -or $build -lt 14393) {
        throw "Trilez Agent requires Windows 10 version 1607 (build 14393) or Windows 11, 64-bit."
    }
}

function Assert-DesktopRuntime {
    $shared = Join-Path $env:ProgramFiles 'dotnet\shared\Microsoft.WindowsDesktop.App'
    if (Test-Path -LiteralPath $shared) {
        $found = @(Get-ChildItem -LiteralPath $shared -Directory | Where-Object { $_.Name -like '8.*' })
        if ($found.Count -gt 0) { return }
    }
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($dotnet) {
        $listed = @(& $dotnet.Source --list-runtimes 2>$null)
        foreach ($line in $listed) {
            if ($line -like 'Microsoft.WindowsDesktop.App 8.*') { return }
        }
    }
    throw "Install the Microsoft .NET 8 Desktop Runtime (x64). The ASP.NET or base runtime is not enough for this WPF application."
}

function Test-Inside([string]$boundary, [string]$candidate) {
    $root = [IO.Path]::GetFullPath($boundary)
    $full = [IO.Path]::GetFullPath($candidate)
    if ($full.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    $prefix = $root
    if (-not $prefix.EndsWith('\')) { $prefix = $prefix + '\' }
    return $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Convert-AgentVersion([string]$version) {
    $parts = $version.Split('.')
    if ($parts.Length -ne 3) { throw "The package version must be three numbers." }
    $numbers = New-Object int[] 3
    for ($i = 0; $i -lt 3; $i++) {
        $number = 0
        if (-not [int]::TryParse($parts[$i], [ref]$number) -or $number -lt 0 -or $number -gt 9999) {
            throw "The package version must be three numbers."
        }
        $numbers[$i] = $number
    }
    return $numbers
}

function Test-NewerVersion([string]$candidate, [string]$installed) {
    $left = Convert-AgentVersion $candidate
    $right = Convert-AgentVersion $installed
    for ($i = 0; $i -lt 3; $i++) {
        if ($left[$i] -gt $right[$i]) { return $true }
        if ($left[$i] -lt $right[$i]) { return $false }
    }
    return $false
}

function Test-SameVersion([string]$left, [string]$right) {
    $a = Convert-AgentVersion $left
    $b = Convert-AgentVersion $right
    return ($a[0] -eq $b[0] -and $a[1] -eq $b[1] -and $a[2] -eq $b[2])
}

function Resolve-PayloadPath([string]$root, [string]$relative) {
    if ([string]::IsNullOrWhiteSpace($relative)) { throw "A package path is empty." }
    if ($relative -eq 'manifest.json') { throw "The manifest is not a payload file." }
    if ($relative.Contains(':') -or $relative.StartsWith('/') -or $relative.StartsWith('\')) {
        throw "A package path is not relative."
    }
    $parts = $relative.Split(@('/', '\'), [StringSplitOptions]::None)
    foreach ($part in $parts) {
        if ($part.Length -eq 0 -or $part -eq '.' -or $part -eq '..') { throw "A package path is not allowed." }
    }
    $fullRoot = [IO.Path]::GetFullPath($root)
    $combined = [IO.Path]::GetFullPath((Join-Path $fullRoot ($relative.Replace('/', '\'))))
    if (-not (Test-Inside $fullRoot $combined)) { throw "A package path escapes the package directory." }
    if (-not (Test-Path -LiteralPath $combined -PathType Leaf)) { throw "A package file is missing." }
    $item = Get-Item -LiteralPath $combined -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "A package file is a link." }
    return $combined
}

function Read-VerifiedManifest([string]$packageRoot) {
    $manifestPath = Join-Path $packageRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "The package manifest is missing." }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.product -ne 'Trilez.Agent') { throw "The package product is not Trilez Agent." }
    if ($manifest.runtime -ne 'net8.0-windows') { throw "The package runtime is not the Windows desktop runtime." }
    if ($manifest.rid -ne 'win-x64') { throw "The package is not win-x64." }
    Convert-AgentVersion ([string]$manifest.version) | Out-Null
    $properties = @($manifest.files.PSObject.Properties)
    if ($properties.Count -eq 0) { throw "The package lists no files." }
    foreach ($property in $properties) {
        $full = Resolve-PayloadPath $packageRoot ([string]$property.Name)
        $actual = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
        $expected = [string]$property.Value
        if ([string]::IsNullOrWhiteSpace($expected) -or -not $actual.Equals($expected.Trim(), [StringComparison]::OrdinalIgnoreCase)) {
            throw "A package file hash does not match."
        }
    }
    return $manifest
}

function Copy-VerifiedPackage([string]$packageRoot, [string]$destination, $manifest) {
    if (-not (Test-Path -LiteralPath $destination)) {
        New-Item -ItemType Directory -Path $destination | Out-Null
    }
    foreach ($property in @($manifest.files.PSObject.Properties)) {
        $source = Resolve-PayloadPath $packageRoot ([string]$property.Name)
        $relative = ([string]$property.Name).Replace('/', '\')
        $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
        if (-not (Test-Inside $destination $target)) { throw "A package path escapes the installation directory." }
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
    Copy-Item -LiteralPath (Join-Path $packageRoot 'manifest.json') -Destination (Join-Path $destination 'manifest.json') -Force
    Read-VerifiedManifest $destination | Out-Null
}

function Enable-StartupPreference([string]$json) {
    $pattern = [regex]'"startWithWindows"\s*:\s*(true|false)'
    if ($pattern.IsMatch($json)) {
        return $pattern.Replace($json, '"startWithWindows": true', 1)
    }
    $close = $json.LastIndexOf('}')
    if ($close -lt 0) { throw "agent-settings.json is not a JSON object. Startup was not changed." }
    $body = $json.Substring(0, $close).TrimEnd()
    $comma = ''
    if ($body.Length -gt 0 -and -not $body.EndsWith('{')) { $comma = ',' }
    return $body + $comma + "`r`n  `"startWithWindows`": true`r`n" + $json.Substring($close)
}

function Set-VisibleStartup([string]$exe, [string]$current) {
    $run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if (-not (Test-Path $run)) { New-Item -Path $run -Force | Out-Null }
    New-ItemProperty -Path $run -Name 'Trilez Agent' -Value ('"' + $exe + '"') -PropertyType String -Force | Out-Null
    $settings = Join-Path $env:APPDATA 'Trilez\agent-settings.json'
    if (-not (Test-Path -LiteralPath $settings)) {
        [IO.File]::WriteAllText((Join-Path $current 'install-flags.json'), '{"startWithWindows":true}')
        return
    }
    $raw = [IO.File]::ReadAllText($settings)
    $updated = Enable-StartupPreference $raw
    $temporary = $settings + '.startup.tmp'
    [IO.File]::WriteAllText($temporary, $updated)
    [IO.File]::Copy($temporary, $settings, $true)
    Remove-Item -LiteralPath $temporary -Force
}

function Register-Uninstall([string]$program, [string]$version, [string]$scriptPath) {
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Trilez Agent'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name DisplayName -Value 'Trilez Agent' -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name DisplayVersion -Value $version -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name Publisher -Value 'Trilez' -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name InstallLocation -Value $program -PropertyType String -Force | Out-Null
    $command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '"'
    New-ItemProperty -Path $key -Name UninstallString -Value $command -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $key -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
}

Assert-NotElevated
Assert-SupportedWindows
Assert-DesktopRuntime

$program = Join-Path $env:LOCALAPPDATA 'Programs\Trilez Agent'
$current = Join-Path $program 'current'
$previous = Join-Path $program 'previous'
$uninstallScript = Join-Path $program 'Uninstall-TrilezAgent.ps1'
$sourceUninstall = Join-Path $PSScriptRoot 'Uninstall-TrilezAgent.ps1'

function Invoke-Rollback {
    $previousManifest = Join-Path $previous 'manifest.json'
    if (-not (Test-Path -LiteralPath $previousManifest -PathType Leaf)) {
        throw "There is no previous version to restore."
    }
    Read-VerifiedManifest $previous | Out-Null
    $staging = Join-Path $program 'rollback-staging'
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    if (Test-Path -LiteralPath $current) { Move-Item -LiteralPath $current -Destination $staging }
    try {
        Move-Item -LiteralPath $previous -Destination $current
        if (Test-Path -LiteralPath $staging) { Move-Item -LiteralPath $staging -Destination $previous }
    } catch {
        if (-not (Test-Path -LiteralPath $current) -and (Test-Path -LiteralPath $staging)) {
            Move-Item -LiteralPath $staging -Destination $current
        }
        throw
    }
    $restored = Get-Content -LiteralPath (Join-Path $current 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Register-Uninstall $program ([string]$restored.version) $uninstallScript
    Write-Output "Restored Trilez Agent $($restored.version). User settings and the device credential were not changed."
}

if ($Rollback) {
    Invoke-Rollback
    return
}

if ([string]::IsNullOrWhiteSpace($Package)) { throw "Pass -Package with the local publish directory or zip." }
if ($Package -match '://') { throw "The package must be a local directory or zip. Trilez Agent does not download updates." }

$cleanup = $null
$packageRoot = $Package
if ($Package -like '*.zip') {
    if (-not (Test-Path -LiteralPath $Package -PathType Leaf)) { throw "The package zip was not found." }
    $cleanup = Join-Path ([IO.Path]::GetTempPath()) ('trilez-package-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $cleanup | Out-Null
    Expand-Archive -LiteralPath $Package -DestinationPath $cleanup
    $packageRoot = $cleanup
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'manifest.json'))) {
        $children = @(Get-ChildItem -LiteralPath $packageRoot -Directory)
        if ($children.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $children[0].FullName 'manifest.json'))) {
            $packageRoot = $children[0].FullName
        }
    }
    $manifest = Read-VerifiedManifest $packageRoot
    $installedPath = Join-Path $current 'manifest.json'
    $installed = $null
    if (Test-Path -LiteralPath $installedPath -PathType Leaf) {
        $installed = Get-Content -LiteralPath $installedPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }

    if ($null -eq $installed) {
        if (Test-Path -LiteralPath $current) { throw "The installation directory is not empty." }
        New-Item -ItemType Directory -Path $program -Force | Out-Null
        Copy-VerifiedPackage $packageRoot $current $manifest
    } elseif ($Repair -or (Test-SameVersion ([string]$installed.version) ([string]$manifest.version))) {
        if (-not $Repair) { throw "Trilez Agent $($installed.version) is already installed. Pass -Repair to replace the same version." }
        if (-not (Test-SameVersion ([string]$installed.version) ([string]$manifest.version))) {
            throw "Repair only replaces the same version. Use a newer package to upgrade, or -Rollback to restore the previous one."
        }
        $staging = Join-Path $program 'repair-staging'
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
        Move-Item -LiteralPath $current -Destination $staging
        try {
            Copy-VerifiedPackage $packageRoot $current $manifest
            Remove-Item -LiteralPath $staging -Recurse -Force
        } catch {
            if (Test-Path -LiteralPath $current) { Remove-Item -LiteralPath $current -Recurse -Force }
            if (-not (Test-Path -LiteralPath $current) -and (Test-Path -LiteralPath $staging)) {
                Move-Item -LiteralPath $staging -Destination $current
            }
            throw
        }
    } elseif (Test-NewerVersion ([string]$manifest.version) ([string]$installed.version)) {
        if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
        Move-Item -LiteralPath $current -Destination $previous
        try {
            Copy-VerifiedPackage $packageRoot $current $manifest
        } catch {
            if (Test-Path -LiteralPath $current) { Remove-Item -LiteralPath $current -Recurse -Force }
            if (-not (Test-Path -LiteralPath $current) -and (Test-Path -LiteralPath $previous)) {
                Move-Item -LiteralPath $previous -Destination $current
            }
            throw
        }
    } else {
        throw "The package version $($manifest.version) is older than installed $($installed.version). This installer does not downgrade in place. Use -Rollback when a previous directory is present."
    }

    Copy-Item -LiteralPath $sourceUninstall -Destination $uninstallScript -Force
    Register-Uninstall $program ([string]$manifest.version) $uninstallScript
    if ($StartWithWindows) {
        Set-VisibleStartup (Join-Path $current 'Trilez.Agent.Desktop.exe') $current
        Write-Output "Startup was enabled in the current user's Startup apps list."
    }
    Write-Output "Trilez Agent $($manifest.version) is installed for the current user at $current"
} finally {
    if ($cleanup) { Remove-Item -LiteralPath $cleanup -Recurse -Force -ErrorAction SilentlyContinue }
}
