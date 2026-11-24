<# Reload local Atelier code without touching PostgreSQL or project data. #>
[CmdletBinding()]
param(
    [switch]$BackgroundWorker,
    [string]$BridgeSecret
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repo '.atelier-logs'
if (-not $BackgroundWorker) {
    # WMI owns the hidden worker independently of a terminal/agent job object.
    # Closing the caller must not terminate the application it just started.
    $previousStart = $null
    try { $previousStart = (Invoke-RestMethod 'http://127.0.0.1:3100/api/health' -TimeoutSec 3).serverInfo.processStartedAt } catch {}
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $command = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -BackgroundWorker'
    if ($BridgeSecret) { $command += ' -BridgeSecret "' + $BridgeSecret.Replace('"', '""') + '"' }
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; CurrentDirectory = $repo; ProcessStartupInformation = $startup }
    if ($created.ReturnValue -ne 0) { throw "Cannot start the detached Atelier worker (code $($created.ReturnValue))." }
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3100/api/health' -TimeoutSec 3
            if ($health.status -eq 'ok' -and $health.serverInfo.processStartedAt -ne $previousStart) {
                Write-Host 'Atelier restarted on port 3100 in a persistent hidden background worker.'
                return
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "Restart did not complete. Check $logDir\restart-atelier.log; active agents may have prevented restart."
}
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Transcript -Path (Join-Path $logDir 'restart-atelier.log') -Append | Out-Null
$python = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCmd) { $python = $pythonCmd.Source }
}
if (-not $python -or -not (Test-Path -LiteralPath $python)) { throw 'Project Python environment is missing.' }

$server = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($server) {
    $companies = Invoke-RestMethod 'http://127.0.0.1:3100/api/companies' -TimeoutSec 5
    foreach ($company in $companies) {
        $runs = Invoke-RestMethod "http://127.0.0.1:3100/api/companies/$($company.id)/live-runs" -TimeoutSec 5
        if (($runs | Measure-Object).Count -gt 0) { throw 'Agent work is active. Let it finish before restarting.' }
    }
}

# Validate both owners before stopping either one. Never stop another application.
$owners = @()
foreach ($port in @(8000, 3100)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { continue }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $command = [string]$process.CommandLine
    $valid = if ($port -eq 8000) {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/health' -TimeoutSec 10
        $process.Name -eq 'python.exe' -and $command -match 'uvicorn app\.main:app' -and $health.service -eq 'ATELIER AI Backend'
    } else {
        $process.Name -eq 'node.exe' -and $command.Contains((Join-Path $repo 'paperclip')) -and $command -match 'src[\\/]index\.ts'
    }
    if (-not $valid) { throw "Port $port belongs to an unverified process. Nothing was stopped." }
    # A venv launcher can spawn a child whose executable path is the global
    # interpreter. Keep the verified project venv selected above; only fall
    # back to the listener executable when the venv is genuinely absent.
    if ($port -eq 8000 -and $process.ExecutablePath -and -not (Test-Path -LiteralPath (Join-Path $repo '.venv\Scripts\python.exe'))) {
        $python = $process.ExecutablePath
    }
    $owners += @{ Port = $port; Id = [int]$process.ProcessId }
}
foreach ($entry in $owners) {
    $listener = Get-NetTCPConnection -LocalPort $entry.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener -and $listener.OwningProcess -ne $entry.Id) { throw 'Port owner changed. Restart aborted.' }
    if ($listener) { Stop-Process -Id $entry.Id }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
if (-not $BridgeSecret) {
    $secretBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
    $BridgeSecret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
}
$env:ATELIER_BRIDGE_SECRET = $BridgeSecret
$env:ATELIER_REQUIRE_ACTOR_CONTEXT = '1'
Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.main:app','--app-dir','apps\api','--host','127.0.0.1','--port','8000' -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'api-stdout.log') -RedirectStandardError (Join-Path $logDir 'api-stderr.log') | Out-Null
& (Join-Path $PSScriptRoot 'start-paperclip.ps1') -NoBrowser -TimeoutSeconds 60
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Paperclip startup failed. Check the startup output.' }
Write-Host 'Atelier startup completed: http://127.0.0.1:3100'
