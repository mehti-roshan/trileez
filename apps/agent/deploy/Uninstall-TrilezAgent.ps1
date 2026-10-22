#Requires -Version 5.1
<#
.SYNOPSIS
  Removes the per-user Trilez Agent installation.

.DESCRIPTION
  Deletes only the agent's program files, its visible startup entry, its uninstall registration,
  and the known files it created under %APPDATA%\Trilez. Pass -KeepData to leave settings and the device credential.
  This script does not delete Documents or unrelated AppData.
#>
[CmdletBinding()]
param(
    [switch]$KeepData
)

$ErrorActionPreference = 'Stop'

function Test-Inside([string]$boundary, [string]$candidate) {
    $root = [IO.Path]::GetFullPath($boundary)
    $full = [IO.Path]::GetFullPath($candidate)
    if ($full.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    $prefix = $root
    if (-not $prefix.EndsWith('\')) { $prefix = $prefix + '\' }
    return $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Test-Reparse([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    $item = Get-Item -LiteralPath $path -Force
    return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Remove-OwnedTree([string]$directory, [string]$boundary) {
    $full = [IO.Path]::GetFullPath($directory)
    if (-not (Test-Inside $boundary $full)) { throw "Refusing to delete a path outside $boundary." }
    if (-not (Test-Path -LiteralPath $full)) { return }
    if (Test-Reparse $full) {
        Remove-Item -LiteralPath $full -Force
        return
    }
    $children = @(Get-ChildItem -LiteralPath $full -Force)
    foreach ($child in $children) {
        if (Test-Reparse $child.FullName) {
            Remove-Item -LiteralPath $child.FullName -Force
        } elseif ($child.PSIsContainer) {
            Remove-OwnedTree $child.FullName $boundary
        } else {
            Remove-Item -LiteralPath $child.FullName -Force
        }
    }
    Remove-Item -LiteralPath $full -Force
}

function Remove-OwnedFile([string]$path, [string]$boundary) {
    $full = [IO.Path]::GetFullPath($path)
    if (-not (Test-Inside $boundary $full)) { throw "Refusing to delete a path outside $boundary." }
    $current = Split-Path -Parent $full
    while ($current -and (Test-Inside $boundary $current) -and -not $current.Equals([IO.Path]::GetFullPath($boundary), [StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Reparse $current) { return }
        $current = Split-Path -Parent $current
    }
    if (-not (Test-Path -LiteralPath $full)) { return }
    if (Test-Reparse $full) {
        Remove-Item -LiteralPath $full -Force
        return
    }
    if (Test-Path -LiteralPath $full -PathType Leaf) { Remove-Item -LiteralPath $full -Force }
}

function Remove-EmptyDirectory([string]$directory) {
    if (-not (Test-Path -LiteralPath $directory)) { return }
    if (Test-Reparse $directory) { return }
    if (@(Get-ChildItem -LiteralPath $directory -Force).Count -gt 0) { return }
    Remove-Item -LiteralPath $directory -Force
}

$program = Join-Path $env:LOCALAPPDATA 'Programs\Trilez Agent'
$data = Join-Path $env:APPDATA 'Trilez'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Test-Path $run) {
    $startup = (Get-ItemProperty -Path $run -Name 'Trilez Agent' -ErrorAction SilentlyContinue).'Trilez Agent'
    if ($startup -and [string]$startup -like '*Trilez.Agent.Desktop.exe*') {
        Remove-ItemProperty -Path $run -Name 'Trilez Agent'
    }
}
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Trilez Agent'
if (Test-Path $uninstallKey) { Remove-Item -LiteralPath $uninstallKey -Recurse -Force }

if (Test-Path -LiteralPath $program) {
    foreach ($name in @('current', 'previous', 'repair-staging', 'rollback-staging')) {
        $path = Join-Path $program $name
        if (Test-Path -LiteralPath $path) { Remove-OwnedTree $path $program }
    }
    Remove-OwnedFile (Join-Path $program 'Uninstall-TrilezAgent.ps1') $program
    Remove-OwnedFile (Join-Path $program 'install-flags.json') $program
    Remove-EmptyDirectory $program
}

if (-not $KeepData -and (Test-Path -LiteralPath $data)) {
    $logs = Join-Path $data 'logs'
    if (Test-Reparse $logs) {
        Remove-Item -LiteralPath $logs -Force
    } elseif (Test-Path -LiteralPath $logs) {
        foreach ($name in @('agent.log', 'agent.log.1')) {
            Remove-OwnedFile (Join-Path $logs $name) $data
        }
        Remove-EmptyDirectory $logs
    }
    foreach ($name in @(
            'agent-settings.json',
            'agent-settings.json.tmp',
            'device-credential.json',
            'device-credential.json.tmp',
            'usage-queue.json',
            'usage-queue.json.tmp',
            'health-queue.json',
            'health-queue.json.tmp',
            'agent.lock',
            'install-flags.json')) {
        Remove-OwnedFile (Join-Path $data $name) $data
    }
    Remove-EmptyDirectory $data
}

Write-Output "Trilez Agent was removed for the current user."
if ($KeepData) { Write-Output "Settings and the device credential were left in $data." }
