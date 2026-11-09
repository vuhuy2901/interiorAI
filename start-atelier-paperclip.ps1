<#
.SYNOPSIS
  ATELIER AI 2.0 (Paperclip-First / Unified) Compatibility Wrapper
  Redirects to the unified startup script start-atelier.ps1.
#>

param(
    [switch]$LocalUse = $false,
    [int]$Port = 3100,
    [switch]$NoBrowser = $false
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$RootDir\start-atelier.ps1" -NoBrowser:$NoBrowser
