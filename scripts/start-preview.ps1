# FEAT-2026-165: start the limited LAN preview server (separate from the admin API on 8000).
# Optional: the API starts it automatically when you click "Xuat link 3D".
param([int]$Port = 3200)

$repo = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDir = Join-Path $repo 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__health" -TimeoutSec 2
    if ($h.service -eq 'atelier-preview') { Write-Host "Preview server already running on $Port"; exit 0 }
} catch {}

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Error "Port $Port is used by another program. Pick another port: -Port 3201"; exit 1
}

Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.preview_app:app','--app-dir','apps\api','--host','0.0.0.0','--port',$Port,'--log-level','warning' `
    -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'preview-stdout.log') -RedirectStandardError (Join-Path $logDir 'preview-stderr.log') | Out-Null
Start-Sleep -Seconds 2
Write-Host "Preview server on 0.0.0.0:$Port. If phones cannot connect, allow TCP $Port on the Private firewall profile (the app never edits the firewall):"
Write-Host "  New-NetFirewallRule -DisplayName 'Atelier Preview' -Direction Inbound -Protocol TCP -LocalPort $Port -Profile Private -Action Allow"
