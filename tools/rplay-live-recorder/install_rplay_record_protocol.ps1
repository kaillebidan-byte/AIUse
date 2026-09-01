param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scheme = 'aiuse-rplay-record'
$regRoot = "HKCU:\Software\Classes\$scheme"
$installRoot = Join-Path $env:LOCALAPPDATA 'AIUse\rplay-live-recorder'
$sourceHandler = Join-Path $PSScriptRoot 'rplay_record_protocol.ps1'
$installedHandler = Join-Path $installRoot 'rplay_record_protocol.ps1'

if ($Uninstall) {
  Remove-Item -LiteralPath $regRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed URL protocol: $scheme"
  exit 0
}

if (-not (Test-Path -LiteralPath $sourceHandler)) {
  throw "Handler was not found beside this installer: $sourceHandler"
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'ffmpeg was not found on PATH. Install/enable ffmpeg before registering the recorder.'
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item -LiteralPath $sourceHandler -Destination $installedHandler -Force

New-Item -Path $regRoot -Force | Out-Null
Set-Item -Path $regRoot -Value 'URL:AIUse RPLAY Recorder'
New-ItemProperty -Path $regRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$regRoot\DefaultIcon" -Force | Out-Null
Set-Item -Path "$regRoot\DefaultIcon" -Value 'powershell.exe,0'
New-Item -Path "$regRoot\shell\open\command" -Force | Out-Null

$command = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}" "%1"' -f $installedHandler
Set-Item -Path "$regRoot\shell\open\command" -Value $command

Write-Host 'RPLAY recorder protocol installed.'
Write-Host "Scheme=$scheme"
Write-Host "Handler=$installedHandler"
Write-Host 'The first browser launch may ask whether to open the external protocol.'
