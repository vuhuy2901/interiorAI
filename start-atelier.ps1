<#
.SYNOPSIS
  ATELIER AI — Unified Architectural Studio & Multi-Agent Control Plane
  One-Command Startup & Lifecycle Management Script for Windows

.DESCRIPTION
  Starts the unified ATELIER AI application on http://localhost:3100:
  - Embedded PostgreSQL 18.1 (port 54329)
  - FastAPI CAD / BOQ / Pascal BIM Backend (http://127.0.0.1:8000)
  - Paperclip Unified App Shell + 2D/3D Design Studio (http://localhost:3100)
  Opens a single browser tab at http://localhost:3100.

.EXAMPLE
  .\start-atelier.ps1         # Starts the entire unified application
  .\start-atelier.ps1 -Stop   # Safely stops managed background services
#>

param(
    [switch]$Stop = $false,
    [switch]$NoBrowser = $false
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   ATELIER AI — Unified Architectural Studio & Control Plane    " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STOP MODE: Safely terminate managed ATELIER services
# ------------------------------------------------------------------------------
if ($Stop) {
    Write-Host "[STOP] Stopping ATELIER AI managed processes..." -ForegroundColor Yellow
    
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8000, 3100 }
    foreach ($conn in $listeners) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "  -> Stopping $($p.ProcessName) (PID $($p.Id)) on port $($conn.LocalPort)..." -ForegroundColor DarkGray
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✅ ATELIER AI services have been stopped." -ForegroundColor Green
    exit 0
}

# ------------------------------------------------------------------------------
# STEP 1: Environment & Tooling Verification
# ------------------------------------------------------------------------------
Write-Host "[1/5] Checking environment runtime..." -ForegroundColor Green

if (Get-Command fnm -ErrorAction SilentlyContinue) {
    fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
    fnm use v24.22.2 | Out-Null
}

$NodeVersion = (node -v)
$PythonVersion = (python --version)
Write-Host "  -> Node.js : $NodeVersion" -ForegroundColor White
Write-Host "  -> Python  : $PythonVersion" -ForegroundColor White

# ------------------------------------------------------------------------------
# STEP 2: Embedded PostgreSQL 18.1 (Port 54329)
# ------------------------------------------------------------------------------
Write-Host "[2/5] Ensuring Embedded PostgreSQL on port 54329..." -ForegroundColor Green
$pgListening = Get-NetTCPConnection -LocalPort 54329 -State Listen -ErrorAction SilentlyContinue
if (-not $pgListening) {
    $StartPgCmd = "$env:USERPROFILE\.paperclip\instances\default\start_pg.cmd"
    if (Test-Path $StartPgCmd) {
        Write-Host "  -> Starting PostgreSQL via scheduled task 'AtelierEmbeddedPostgres'..." -ForegroundColor Yellow
        schtasks /Run /TN "AtelierEmbeddedPostgres" | Out-Null
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host "  -> PostgreSQL 18.1 is active on port 54329." -ForegroundColor White
}

# ------------------------------------------------------------------------------
# STEP 3: FastAPI Backend (Port 8000)
# ------------------------------------------------------------------------------
Write-Host "[3/5] Checking FastAPI CAD & BOQ Backend (port 8000)..." -ForegroundColor Green
$apiListening = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $apiListening) {
    Write-Host "  -> Starting FastAPI sidecar on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootDir\apps\api'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
    
    $apiReady = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $h = $null
        try {
            $h = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        } catch {}
        if ($h -and $h.status -eq "ok") {
            $apiReady = $true
            break
        }
    }
    if ($apiReady) {
        Write-Host "  -> FastAPI Backend is ready!" -ForegroundColor Green
    } else {
        Write-Host "  -> Warning: Backend starting in background." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> FastAPI Backend is already running on port 8000." -ForegroundColor White
}

# ------------------------------------------------------------------------------
# STEP 4: Paperclip Unified Application (Port 3100)
# ------------------------------------------------------------------------------
Write-Host "[4/5] Checking Paperclip Unified Studio (port 3100)..." -ForegroundColor Green
$paperclipListening = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
if (-not $paperclipListening) {
    Write-Host "  -> Starting ATELIER AI 2.0 Unified Server on http://localhost:3100 ..." -ForegroundColor Yellow
    
    # Ensure Skills catalog is built
    Push-Location "paperclip"
    if (-not (Test-Path "packages\skills-catalog\generated\catalog.json")) {
        Write-Host "  -> Building skills manifest..." -ForegroundColor DarkGray
        pnpm --filter @paperclipai/skills-catalog build:manifest
    }
    Pop-Location
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression; fnm use v24.22.2; Set-Location '$RootDir\paperclip'; `$env:PORT='3100'; `$env:HOST='127.0.0.1'; `$env:ATELIER_LOCAL_LITE='1'; `$env:ATELIER_PYTHON_URL='http://127.0.0.1:8000'; `$env:PAPERCLIP_DEPLOYMENT_MODE='local_trusted'; `$env:PAPERCLIP_DEPLOYMENT_EXPOSURE='private'; `$env:PAPERCLIP_TELEMETRY_DISABLED='1'; `$env:PAPERCLIP_SENTRY_RUN_FAILURES='off'; `$env:PAPERCLIP_UI_DEV_MIDDLEWARE='true'; pnpm --filter @paperclipai/server dev"
    
    Write-Host "  -> Waiting for Paperclip to initialize..." -ForegroundColor DarkGray
    $paperclipReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $boot = $null
        try {
            $boot = Invoke-RestMethod -Uri "http://127.0.0.1:3100/api/atelier/bootstrap" -Method Get -TimeoutSec 3 -ErrorAction Stop
        } catch {}
        if ($boot -and $boot.ok -eq $true) {
            $paperclipReady = $true
            break
        }
    }
    if ($paperclipReady) {
        Write-Host "  -> Paperclip Unified Host is ready!" -ForegroundColor Green
    } else {
        Write-Host "  -> Paperclip is compiling modules and will be live shortly." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> Paperclip Unified Host is already active on port 3100." -ForegroundColor White
}

# ------------------------------------------------------------------------------
# STEP 5: Final Health Check & Single Browser Launch
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] ATELIER AI Hệ Thống Đã Hợp Nhất & Hoạt Động!" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  🌐 Ứng dụng Hợp Nhất : http://localhost:3100" -ForegroundColor White
Write-Host "  🤖 AI Control Center : http://localhost:3100/control-center" -ForegroundColor White
Write-Host "  📐 3D Design Studio  : http://localhost:3100/design-studio" -ForegroundColor White
Write-Host "  💬 Conversations     : http://localhost:3100/chats" -ForegroundColor White
Write-Host "  📋 Tasks & Work      : http://localhost:3100/issues" -ForegroundColor White
Write-Host "  ⚡ FastAPI Docs      : http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan

if (-not $NoBrowser) {
    Write-Host "Opening single browser tab at http://localhost:3100 ..." -ForegroundColor Green
    Start-Process "http://localhost:3100"
}
