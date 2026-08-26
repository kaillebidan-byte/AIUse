param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$Url,

  [ValidateSet('probe','audio','video')]
  [string]$Mode = 'probe',

  [string]$Browser = 'vivaldi',

  [string]$OutputDir = (Join-Path $env:TEMP 'AIUse\browser-media-bridge')
)

$ErrorActionPreference = 'Stop'

function Resolve-YtDlpCommand {
  # When the control runner supplies the verified Python executable, use it
  # directly. Do not pre-probe and silently fall back to an older standalone
  # yt-dlp; the actual yt-dlp invocation will surface any real module error.
  if ($env:AIUSE_YTDLP_PYTHON -and (Test-Path $env:AIUSE_YTDLP_PYTHON)) {
    Write-Host "Using explicit Python yt-dlp: $env:AIUSE_YTDLP_PYTHON"
    return @($env:AIUSE_YTDLP_PYTHON, '-m', 'yt_dlp')
  }

  if ($env:LOCALAPPDATA) {
    $verifiedPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (Test-Path $verifiedPython) {
      Write-Host "Using LocalAppData Python yt-dlp: $verifiedPython"
      return @($verifiedPython, '-m', 'yt_dlp')
    }
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @($py.Source, '-3.12', '-m', 'yt_dlp')
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @($python.Source, '-m', 'yt_dlp')
  }

  $cmd = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if ($cmd) {
    Write-Host "Using standalone yt-dlp: $($cmd.Source)"
    return @($cmd.Source)
  }

  throw @'
yt-dlp was not found.
Install it once with:
  python -m pip install -U "yt-dlp[default]"
Then run this script again.
'@
}

function Resolve-JsRuntimeArgs {
  $deno = Get-Command deno -ErrorAction SilentlyContinue
  if ($deno) { return @('--js-runtimes', 'deno') }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    try {
      $versionText = (& $node.Source --version).Trim()
      $major = [int](($versionText -replace '^v','').Split('.')[0])
      if ($major -ge 22) { return @('--js-runtimes', 'node') }
    } catch {}
  }

  throw @'
No supported JavaScript runtime was found for current YouTube challenges.
Recommended Windows install:
  winget install --id=DenoLand.Deno
Then open a new PowerShell and run this script again.
'@
}

function Invoke-YtDlp([string[]]$Prefix, [string[]]$YtArgs) {
  $exe = $Prefix[0]
  $allArgs = @()
  if ($Prefix.Count -gt 1) { $allArgs += $Prefix[1..($Prefix.Count - 1)] }
  $allArgs += $YtArgs
  & $exe @allArgs
  if ($LASTEXITCODE -ne 0) { throw "yt-dlp failed with exit code $LASTEXITCODE" }
}

$prefix = @(Resolve-YtDlpCommand)
$jsRuntimeArgs = Resolve-JsRuntimeArgs
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$youtubeCompat = @(
  '--remote-components', 'ejs:github',
  '--extractor-args', 'youtube:player_client=default,web_embedded'
) + $jsRuntimeArgs

$common = $youtubeCompat + @(
  '--cookies-from-browser', $Browser,
  '--no-playlist',
  '--windows-filenames',
  '--print-to-file', 'after_move:filepath', (Join-Path $OutputDir 'last-file.txt')
)

switch ($Mode) {
  'probe' {
    $ytArgs = $youtubeCompat + @(
      '--cookies-from-browser', $Browser,
      '--no-playlist',
      '--simulate',
      '--print', '%(extractor_key)s`t%(id)s`t%(title)s`t%(duration_string)s',
      $Url
    )
    Invoke-YtDlp $prefix $ytArgs
  }
  'audio' {
    $ytArgs = $common + @(
      '-f', 'bestaudio/best',
      '-o', (Join-Path $OutputDir '%(extractor_key)s_%(id)s.%(ext)s'),
      $Url
    )
    Invoke-YtDlp $prefix $ytArgs
  }
  'video' {
    $ytArgs = $common + @(
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '-o', (Join-Path $OutputDir '%(extractor_key)s_%(id)s.%(ext)s'),
      $Url
    )
    Invoke-YtDlp $prefix $ytArgs
  }
}

Write-Host "OutputDir=$OutputDir"
