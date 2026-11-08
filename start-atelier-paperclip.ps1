# ==============================================================================
# ATELIER AI 2.0 (Paperclip-First / Local-Lite) Startup Script for Windows
# ==============================================================================
# Usage:
#   .\start-atelier-paperclip.ps1             # Dev mode (Vite HMR + tsx server on :3100)
#   .\start-atelier-paperclip.ps1 -LocalUse   # Low-memory Local-Use mode (built static UI on :3100)
# ==============================================================================

param(
    [switch]$LocalUse = $false,
    [int]$Port = 3100
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PaperclipDir = Join-Path $WorkspaceRoot "paperclip"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " ATELIER AI 2.0 — Paperclip Control Plane + Pascal 3D Studio" -ForegroundColor Cyan
Write-Host " Mode: $(if ($LocalUse) { 'LOCAL-USE (Low-Memory Static UI)' } else { 'DEV (Hot Reload)' })" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Activate Node.js >= 24.11 via fnm if available
if (Get-Command fnm -ErrorAction SilentlyContinue) {
    fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
    fnm use v24.22.2 | Out-Null
}

$NodeVersion = (node -v)
Write-Host "[1/4] Node.js Runtime: $NodeVersion" -ForegroundColor Green

# Ensure Embedded PostgreSQL is running on port 54329 (handles Windows Administrator shells)
$PgProcess = Get-Process -Name "postgres" -ErrorAction SilentlyContinue
if (-not $PgProcess) {
    $StartPgCmd = "$env:USERPROFILE\.paperclip\instances\default\start_pg.cmd"
    if (Test-Path $StartPgCmd) {
        Write-Host "[2/4] Starting Embedded PostgreSQL 18.1 (unprivileged token) on port 54329..." -ForegroundColor Yellow
        schtasks /Run /TN "AtelierEmbeddedPostgres" | Out-Null
        Start-Sleep -Seconds 3
    }
} else {
    Write-Host "[2/4] Embedded PostgreSQL 18.1 is active on port 54329 (PID $($PgProcess[0].Id))" -ForegroundColor Green
}

# Configure Local-Lite Environment (No Docker, No Redis, No RabbitMQ, Embedded PostgreSQL)
$env:PORT = "$Port"
$env:HOST = "127.0.0.1"
$env:ATELIER_LOCAL_LITE = "1"
$env:ATELIER_PYTHON_URL = "http://127.0.0.1:8000"
$env:PAPERCLIP_DEPLOYMENT_MODE = "local_trusted"
$env:PAPERCLIP_DEPLOYMENT_EXPOSURE = "private"
$env:PAPERCLIP_TELEMETRY_DISABLED = "1"
$env:PAPERCLIP_SENTRY_RUN_FAILURES = "off"
$env:PAPERCLIP_ENABLE_DEV_WATCHER = $(if ($LocalUse) { "false" } else { "true" })

Set-Location $PaperclipDir

if ($LocalUse) {
    Write-Host "[3/4] Building UI bundle for low-memory Local-Use mode..." -ForegroundColor Yellow
    pnpm --filter @paperclipai/ui build
    $env:PAPERCLIP_UI_DEV_MIDDLEWARE = "false"
    Write-Host "[4/4] Starting ATELIER AI 2.0 Local-Use Server on http://localhost:$Port ..." -ForegroundColor Green
    pnpm --filter @paperclipai/server dev
} else {
    Write-Host "[3/4] Building bundled Interior Design Skills catalog..." -ForegroundColor Yellow
    pnpm --filter @paperclipai/skills-catalog build:manifest
    $env:PAPERCLIP_UI_DEV_MIDDLEWARE = "true"
    Write-Host "[4/4] Starting ATELIER AI 2.0 Dev Server on http://localhost:$Port ..." -ForegroundColor Green
    pnpm --filter @paperclipai/server dev:watch
}
