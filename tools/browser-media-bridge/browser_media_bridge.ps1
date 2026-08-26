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
  $cmd = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if ($cmd) {
    return @($cmd.Source)
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    try {
      & $py.Source -m yt_dlp --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return @($py.Source, '-m', 'yt_dlp')
      }
    } catch {}
  }

  throw @'
yt-dlp was not found.
Install it once with:
  py -m pip install -U yt-dlp
Then run this script again.
'@
}

function Invoke-YtDlp([string[]]$Prefix, [string[]]$YtArgs) {
  $exe = $Prefix[0]
  $allArgs = @()
  if ($Prefix.Count -gt 1) {
    $allArgs += $Prefix[1..($Prefix.Count - 1)]
  }
  $allArgs += $YtArgs
  & $exe @allArgs
  if ($LASTEXITCODE -ne 0) {
    throw "yt-dlp failed with exit code $LASTEXITCODE"
  }
}

$prefix = Resolve-YtDlpCommand
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$common = @(
  '--cookies-from-browser', $Browser,
  '--no-playlist',
  '--windows-filenames',
  '--print-to-file', 'after_move:filepath', (Join-Path $OutputDir 'last-file.txt')
)

switch ($Mode) {
  'probe' {
    $ytArgs = @(
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
