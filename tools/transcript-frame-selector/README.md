# transcript-frame-selector

## Purpose

`kavenio-youtube-transcribe --timestamps` が生成した `transcript.json` のsegment時刻を使い、元動画から代表frameを抽出する薄いhelper。

新しい動画解析frameworkではなく、既存のWhisper timestamp contract + FFmpeg frame extractionを接続するためのbridge。

## Input

- 元動画 local file
- `transcript.json`
- FFmpeg on PATH

## Default selection

非空segmentの先頭から4件を選び、各segmentの `start_ms` と `end_ms` の中央時刻を代表timestampにする。

## Usage

```powershell
python transcript_frame_selector.py VIDEO.mp4 transcript.json --output-dir frames --count 4
```

Output:

```text
frames/
  segment_000_....jpg
  segment_001_....jpg
  ...
  manifest.json
```

`manifest.json` はsegment index / start_ms / end_ms / midpoint_s / transcript text / frame filenameを対応付ける。

## Completion

frame path生成だけで終わらず、必要なら抽出JPGをassistant側へ搬送しvision確認まで行う。

## Verification

2026-08-26: helper added after Windows local YouTube acquisition + faster-whisper small path succeeded. Live transcript-linked frame extraction pending.
