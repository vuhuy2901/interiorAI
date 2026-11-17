<# Reload local Atelier code without touching PostgreSQL or project data. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repo '.atelier-logs'
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
        $process.Name -eq 'python.exe' -and $command -match 'uvicorn app\.main:app' -and $command -match 'apps[\\/]api'
    } else {
        $process.Name -eq 'node.exe' -and $command.Contains((Join-Path $repo 'paperclip')) -and $command -match 'src[\\/]index\.ts'
    }
    if (-not $valid) { throw "Port $port belongs to an unverified process. Nothing was stopped." }
    $owners += @{ Port = $port; Id = [int]$process.ProcessId }
}
foreach ($entry in $owners) {
    $listener = Get-NetTCPConnection -LocalPort $entry.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener -and $listener.OwningProcess -ne $entry.Id) { throw 'Port owner changed. Restart aborted.' }
    if ($listener) { Stop-Process -Id $entry.Id }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.main:app','--app-dir','apps\api','--host','127.0.0.1','--port','8000' -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'api-stdout.log') -RedirectStandardError (Join-Path $logDir 'api-stderr.log') | Out-Null
& (Join-Path $PSScriptRoot 'start-paperclip.ps1') -NoBrowser -TimeoutSeconds 60
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Paperclip startup failed. Check the startup output.' }
Write-Host 'Atelier startup completed: http://127.0.0.1:3100'
