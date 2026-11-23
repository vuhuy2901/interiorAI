<#
.SYNOPSIS
  Compatibility entrypoint for the Paperclip-first workspace startup.
#>

param(
    [switch]$Stop,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Stop) {
    throw "Automatic stop is disabled for safety. Identify and stop only the intended Paperclip process explicitly."
}

# --- FEAT-2026-155: auto-start FurniMesh MCP (skip if port already listening) ---
function Start-FurniMeshMcp {
    param([string]$Root)
    $mcpPort = 3180
    if ($env:FURNIMESH_MCP_PORT -match '^\d+$') { $mcpPort = [int]$env:FURNIMESH_MCP_PORT }
    try {
        $listening = Get-NetTCPConnection -LocalPort $mcpPort -State Listen -ErrorAction SilentlyContinue
        if ($listening) { Write-Host "FurniMesh MCP already listening on port $mcpPort; skipping."; return }
        $entry = Join-Path $Root "paperclip\packages\furnimesh-mcp\dist\http.js"
        if (-not (Test-Path $entry)) { Write-Warning "FurniMesh MCP not built ($entry); skipping."; return }
        $logDir = Join-Path $Root ".atelier-logs"
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        $env:FURNIMESH_MCP_PORT = "$mcpPort"
        $env:PORT = "$mcpPort"
        Start-Process -FilePath "node" -ArgumentList "`"$entry`"" -WorkingDirectory (Join-Path $Root "paperclip") -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logDir "furnimesh-mcp.out.log") -RedirectStandardError (Join-Path $logDir "furnimesh-mcp.err.log") | Out-Null
        Write-Host "FurniMesh MCP started on port $mcpPort."
    } catch {
        Write-Warning "FurniMesh MCP start failed: $($_.Exception.Message)"
    }
}

Start-FurniMeshMcp -Root $RepoRoot

& (Join-Path $RepoRoot "scripts\start-paperclip.ps1") -NoBrowser:$NoBrowser
exit $LASTEXITCODE
