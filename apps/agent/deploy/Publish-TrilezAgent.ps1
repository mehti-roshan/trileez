#Requires -Version 5.1
<#
.SYNOPSIS
  Publishes the framework-dependent win-x64 agent and writes manifest.json.

.DESCRIPTION
  Run this on Windows. The desktop project is a placeholder library on other operating systems.
  The manifest lists SHA-256 hashes of the published files. It does not upload the package.
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [string]$Version = '0.2.0',
    [string]$Output
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
    throw "Publish the Windows agent on Windows. On this operating system the desktop project does not produce a WPF executable."
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be three numbers, for example 0.2.0." }

$agentRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $agentRoot 'src\Trilez.Agent.Desktop\Trilez.Agent.Desktop.csproj'
if (-not $Output) {
    $Output = Join-Path $agentRoot ("src\Trilez.Agent.Desktop\bin\{0}\net8.0-windows\win-x64\publish" -f $Configuration)
}

& dotnet publish $project -c $Configuration -r win-x64 --self-contained false -o $Output
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE." }

$fullOutput = [IO.Path]::GetFullPath($Output)
$files = [ordered]@{}
$published = @(Get-ChildItem -LiteralPath $fullOutput -Recurse -File -Force)
foreach ($file in $published) {
    $relative = $file.FullName.Substring($fullOutput.Length).TrimStart('\', '/').Replace('\', '/')
    if ($relative -eq 'manifest.json') { continue }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "The publish directory contains a link: $relative" }
    if ($relative.Contains(':') -or $relative.Contains('..')) { throw "Unexpected publish path: $relative" }
    $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
if ($files.Count -eq 0) { throw "The publish directory has no files." }

$manifest = [ordered]@{
    product = 'Trilez.Agent'
    version = $Version
    runtime = 'net8.0-windows'
    rid = 'win-x64'
    files = $files
}
$json = $manifest | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $fullOutput 'manifest.json'), $json)
Write-Output "Wrote manifest.json for Trilez Agent $Version in $fullOutput"
