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

& (Join-Path $RepoRoot "scripts\start-paperclip.ps1") -NoBrowser:$NoBrowser
exit $LASTEXITCODE
