param(
  [string]$InvocationUrl = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$prefix = "AIUSE_RPLAY_RECORD_V1`n"
$payload = Get-Clipboard -Raw -ErrorAction Stop
if (-not $payload -or -not $payload.StartsWith($prefix)) {
  throw 'RPLAY recorder payload was not found on the clipboard.'
}

# Remove the signed media URL from the clipboard as soon as it is in this process.
Set-Clipboard -Value ''

$jsonText = $payload.Substring($prefix.Length)
$data = $jsonText | ConvertFrom-Json
$url = [string]$data.media_url
$pageUrl = [string]$data.page_url
$title = [string]$data.title

if (-not $url) { throw 'media_url is required.' }
$uri = [Uri]$url
if ($uri.Scheme -ne 'https') { throw 'RPLAY media URL must use https.' }
if ($uri.Host -notin @('livestream.rplay.live', 'api.rplay.live')) {
  throw "Unexpected RPLAY media host: $($uri.Host)"
}
if ($uri.AbsolutePath -notmatch '(?i)\.(flv|m3u8|mp4)$' -and $uri.AbsolutePath -notmatch '(?i)/live/stream/') {
  throw "Unexpected RPLAY media path: $($uri.AbsolutePath)"
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) { throw 'ffmpeg was not found on PATH.' }

$creator = $null
if ($pageUrl -match '(?i)rplay\.live/live/([0-9a-f]{24})') {
  $creator = $Matches[1].ToLowerInvariant()
} elseif ($url -match '(?i)creatorId=([0-9a-f]{24})') {
  $creator = $Matches[1].ToLowerInvariant()
} elseif ($url -match '(?i)/live/([0-9a-f]{24})_') {
  $creator = $Matches[1].ToLowerInvariant()
}
if (-not $creator) { $creator = 'unknown' }

function Sanitize-Component([string]$Value, [string]$Fallback) {
  $text = if ($Value) { $Value } else { $Fallback }
  $text = $text -replace '[<>:"/\\|?*\x00-\x1f]+', '_'
  $text = $text -replace '\s+', ' '
  $text = $text.Trim(' ', '.', '_')
  if (-not $text) { $text = $Fallback }
  if ($text.Length -gt 80) { $text = $text.Substring(0, 80).TrimEnd(' ', '.') }
  return $text
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safeTitle = Sanitize-Component $title 'RPLAY-live'
$outputDir = Join-Path $env:USERPROFILE 'Videos\AIUse\RPLAY\live'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$output = Join-Path $outputDir ("{0}_{1}_{2}.mkv" -f $stamp, $safeTitle, $creator)

Write-Host 'RPLAY live recording started.'
Write-Host "Output=$output"
Write-Host 'Press q to stop cleanly.'
Write-Host ''

& $ffmpeg.Source -hide_banner -loglevel info -i $url -map 0 -c copy $output
$exitCode = $LASTEXITCODE

if (Test-Path -LiteralPath $output) {
  $item = Get-Item -LiteralPath $output
  Write-Host ''
  Write-Host ("Saved: {0} bytes" -f $item.Length)
  try { Start-Process explorer.exe -ArgumentList @('/select,', $output) } catch {}
}

exit $exitCode
