param(
  [switch]$Uninstall,
  [switch]$NoOpenUserscript
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scheme = 'aiuse-rplay-record'
$regRoot = "HKCU:\Software\Classes\$scheme"
$installRoot = Join-Path $env:LOCALAPPDATA 'AIUse\rplay-live-recorder'
$installedHandler = Join-Path $installRoot 'rplay_record_protocol.ps1'
$rawBase = 'https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/chatgpt-inline-video-lite'
$handlerUrl = "$rawBase/rplay_record_protocol.ps1"
$userscriptUrl = "$rawBase/chatgpt-inline-video-lite.user.js"
$sourceHandler = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'rplay_record_protocol.ps1' } else { $null }

if ($Uninstall) {
  Remove-Item -LiteralPath $regRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed URL protocol: $scheme"
  exit 0
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'ffmpeg was not found on PATH. Install/enable ffmpeg before registering the recorder.'
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
if ($sourceHandler -and (Test-Path -LiteralPath $sourceHandler)) {
  Copy-Item -LiteralPath $sourceHandler -Destination $installedHandler -Force
} else {
  Invoke-WebRequest -UseBasicParsing -Uri $handlerUrl -OutFile $installedHandler
}

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

if (-not $NoOpenUserscript) {
  Write-Host 'Opening the ChatGPT Inline Video Lite userscript URL in the default browser...'
  Start-Process $userscriptUrl
}
