param(
    [ValidateSet("setup", "quick", "api", "frontend", "e2e", "full")]
    [string]$Mode = "full",
    [switch]$SkipE2E
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$ApiDir = Join-Path $Root "apps\api"
$WebDir = Join-Path $Root "apps\web"
$AdapterDir = Join-Path $Root "packages\pascal-adapter"
$env:PYTHONPATH = $ApiDir

function Invoke-Step([string]$Name, [scriptblock]$Action) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit code $LASTEXITCODE)" }
    Write-Host "PASS: $Name" -ForegroundColor Green
}

if ($Mode -eq "setup") {
    if (-not (Test-Path $Python)) {
        Invoke-Step "Create Python virtual environment" { python -m venv (Join-Path $Root ".venv") }
    }
    Invoke-Step "Install Python test/runtime dependencies" { & $Python -m pip install -r (Join-Path $Root "requirements-dev.txt") }
    Invoke-Step "Install Pascal MCP adapter" { npm --prefix $AdapterDir install }
    Invoke-Step "Install frontend dependencies" { npm --prefix $WebDir install }
    Write-Host "Browser E2E will use installed Google Chrome/Edge when available." -ForegroundColor DarkGray
    Write-Host "`nSetup complete. Run: .\test-atelier.ps1 -Mode full" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $Python)) {
    throw "Missing .venv. Run .\test-atelier.ps1 -Mode setup first."
}

function Test-Quick {
    Invoke-Step "Python compile/import smoke test" {
        & $Python -m py_compile `
            (Join-Path $ApiDir "app\main.py") `
            (Join-Path $ApiDir "app\services\orchestrator.py") `
            (Join-Path $ApiDir "app\services\telegram_progress.py")
    }
    Invoke-Step "Telegram task progress acceptance" {
        & $Python -m pytest (Join-Path $Root "tests\test_acceptance.py") -q -k telegram_realtime
    }
}

function Test-Api {
    Invoke-Step "Backend API and multi-agent acceptance suite" {
        & $Python -m pytest (Join-Path $Root "tests\test_acceptance.py") -v
    }
}

function Test-Frontend {
    Invoke-Step "React TypeScript production build" { npm --prefix $WebDir run build }
}

function Test-E2E {
    Invoke-Step "Playwright browser E2E and responsive screenshots" {
        & $Python (Join-Path $Root "tests\verify_e2e_browser.py")
    }
}

switch ($Mode) {
    "quick" { Test-Quick }
    "api" { Test-Api }
    "frontend" { Test-Frontend }
    "e2e" { Test-E2E }
    "full" {
        Test-Quick
        Test-Api
        Test-Frontend
        if (-not $SkipE2E) { Test-E2E }
    }
}

Write-Host "`nALL REQUESTED TESTS PASSED ($Mode)" -ForegroundColor Green
