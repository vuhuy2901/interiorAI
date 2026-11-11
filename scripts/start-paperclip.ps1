<#
.SYNOPSIS
  Starts the existing local Paperclip deployment on http://localhost:3100.

.DESCRIPTION
  This is the single workspace startup entrypoint. It reuses the existing
  Paperclip source tree and embedded PostgreSQL instance. It does not create a
  Docker Compose stack, a database, or a second Paperclip server.
#>

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [ValidateRange(10, 600)]
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PaperclipRoot = Join-Path $RepoRoot "paperclip"
$PaperclipUrl = "http://localhost:3100"
$HealthUrl = "http://127.0.0.1:3100/api/health"
$PostgresPort = 54329
$PaperclipPort = 3100
$InstanceRoot = Join-Path $env:USERPROFILE ".paperclip\instances\default"
$StartPostgresCmd = Join-Path $InstanceRoot "start_pg.cmd"
$RuntimeLogRoot = Join-Path $InstanceRoot "logs"
$StdoutLog = Join-Path $RuntimeLogRoot "paperclip-stdout.log"
$StderrLog = Join-Path $RuntimeLogRoot "paperclip-stderr.log"

function Get-ListeningProcessId {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return $null
}

function Get-PaperclipHealth {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
        $hasVersion = -not [string]::IsNullOrWhiteSpace([string]$response.version) -or
            -not [string]::IsNullOrWhiteSpace([string]$response.serverVersion)
        if ($response.status -eq "ok" -and $response.deploymentMode -eq "local_trusted" -and $hasVersion) {
            return $response
        }
    } catch { return $null }
    return $null
}

function Open-Paperclip {
    if (-not $NoBrowser) { Start-Process $PaperclipUrl }
}

function Wait-ForPort {
    param([int]$Port, [int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Get-ListeningProcessId -Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

Write-Host "Paperclip workspace startup" -ForegroundColor Cyan
Write-Host "Deployment: existing local source + embedded PostgreSQL (no Docker Compose)"

if (-not (Test-Path (Join-Path $PaperclipRoot "package.json"))) {
    throw "Existing Paperclip source was not found at '$PaperclipRoot'. Nothing was installed or created."
}

$existingHealth = Get-PaperclipHealth
if ($existingHealth) {
    $existingPid = Get-ListeningProcessId -Port $PaperclipPort
    Write-Host "Paperclip is already healthy on port 3100 (PID $existingPid). No restart needed." -ForegroundColor Green
    Open-Paperclip
    exit 0
}

$portOwner = Get-ListeningProcessId -Port $PaperclipPort
if ($portOwner) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $portOwner" -ErrorAction SilentlyContinue
    $ownerName = if ($owner) { $owner.Name } else { "unknown" }
    throw "Port 3100 is occupied by a non-Paperclip or unhealthy process (PID $portOwner, $ownerName). It was not stopped. Free the port, then run this script again."
}

if (-not (Get-ListeningProcessId -Port $PostgresPort)) {
    if (-not (Test-Path $StartPostgresCmd)) {
        throw "The existing embedded PostgreSQL launcher was not found at '$StartPostgresCmd'. No database was created."
    }
    $postgresTask = Get-ScheduledTask -TaskName "AtelierEmbeddedPostgres" -ErrorAction SilentlyContinue
    $expectedLauncher = [System.IO.Path]::GetFullPath($StartPostgresCmd)
    $taskOwnsExistingInstance = $false
    if ($postgresTask) {
        foreach ($action in $postgresTask.Actions) {
            $actionText = "$($action.Execute) $($action.Arguments)"
            if ($actionText -like "*$expectedLauncher*") { $taskOwnsExistingInstance = $true; break }
        }
    }
    if (-not $taskOwnsExistingInstance) {
        throw "Scheduled task 'AtelierEmbeddedPostgres' was not verified against the existing Paperclip instance. It was not run."
    }
    Write-Host "Starting the existing embedded PostgreSQL instance on port 54329..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName "AtelierEmbeddedPostgres"
    if (-not (Wait-ForPort -Port $PostgresPort -Seconds 30)) {
        throw "Embedded PostgreSQL did not become ready on port 54329 within 30 seconds. Its data directory was not modified by this script."
    }
} else {
    Write-Host "Embedded PostgreSQL is already listening on port 54329."
}

$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpm) { throw "pnpm.cmd is unavailable in PATH. Activate the existing Node.js toolchain, then run this script again." }
if (-not (Test-Path (Join-Path $PaperclipRoot "node_modules"))) {
    throw "Paperclip dependencies are missing. This script will not install or replace them automatically."
}

New-Item -ItemType Directory -Path $RuntimeLogRoot -Force | Out-Null
$startupEnvironment = @{
    PORT = "3100"; HOST = "127.0.0.1"; ATELIER_LOCAL_LITE = "1"
    ATELIER_PYTHON_URL = "http://127.0.0.1:8000"
    PAPERCLIP_DEPLOYMENT_MODE = "local_trusted"; PAPERCLIP_DEPLOYMENT_EXPOSURE = "private"
    PAPERCLIP_TELEMETRY_DISABLED = "1"; PAPERCLIP_SENTRY_RUN_FAILURES = "off"
    PAPERCLIP_UI_DEV_MIDDLEWARE = "true"
}
$previousEnvironment = @{}
foreach ($entry in $startupEnvironment.GetEnumerator()) {
    $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
}

try {
    Write-Host "Starting the existing Paperclip server on port 3100..." -ForegroundColor Yellow
    $paperclipProcess = Start-Process -FilePath $pnpm.Source -ArgumentList "--filter", "@paperclipai/server", "dev" `
        -WorkingDirectory $PaperclipRoot -WindowStyle Hidden -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog -PassThru
} finally {
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    $paperclipProcess.Refresh()
    if ($paperclipProcess.HasExited) {
        throw "Paperclip exited during startup with code $($paperclipProcess.ExitCode). See '$StderrLog' and '$StdoutLog'."
    }
    $health = Get-PaperclipHealth
    if ($health) {
        Write-Host "Paperclip is healthy at $PaperclipUrl (PID $($paperclipProcess.Id))." -ForegroundColor Green
        Open-Paperclip
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw "Paperclip did not become healthy within $TimeoutSeconds seconds. The process was left running for diagnosis. See '$StderrLog' and '$StdoutLog'."
