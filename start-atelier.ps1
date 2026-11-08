<#
.SYNOPSIS
  ATELIER AI — 1-Command Startup Script (Windows PowerShell)
  Starts both the FastAPI Backend (http://127.0.0.1:8000) and Vite React Studio (http://127.0.0.1:5173).
#>

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ATELIER AI — Intelligent Interior Design Studio (Pascal BIM)  " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

if (-not (Test-Path "packages\pascal-adapter\node_modules")) {
  Write-Host "[1/4] Installing Pascal MCP Adapter (@pascal-app/mcp)..." -ForegroundColor Yellow
  Push-Location "packages\pascal-adapter"
  npm install --engine-strict=false --no-audit --no-fund
  Pop-Location
}

if (-not (Test-Path "apps\web\node_modules")) {
  Write-Host "[2/4] Installing Frontend Studio packages..." -ForegroundColor Yellow
  Push-Location "apps\web"
  npm install --no-audit --no-fund
  Pop-Location
}

Write-Host "[3/4] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootDir\apps\api'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

Write-Host "[4/4] Starting Vite React Studio on http://127.0.0.1:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootDir\apps\web'; npm run dev"

Write-Host ""
Write-Host "ATELIER AI is launching!" -ForegroundColor Cyan
Write-Host "  -> Web Studio UI : http://127.0.0.1:5173" -ForegroundColor White
Write-Host "  -> OpenAPI Docs  : http://127.0.0.1:8000/docs" -ForegroundColor White
