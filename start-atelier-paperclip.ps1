<#
.SYNOPSIS
  Paperclip compatibility wrapper.
  Redirects to the single workspace startup entrypoint.
#>

param(
    [switch]$LocalUse = $false,
    [int]$Port = 3100,
    [switch]$NoBrowser = $false
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($Port -ne 3100) {
    throw "Paperclip workspace startup is fixed to port 3100."
}
& "$RootDir\scripts\start-paperclip.ps1" -NoBrowser:$NoBrowser
