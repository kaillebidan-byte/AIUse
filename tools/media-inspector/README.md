# media-inspector

## Purpose

Thin orchestration layer for media inspection.

```text
URL / local file
  -> acquire only when needed
  -> ffprobe metadata
  -> optional existing youtube-transcribe
  -> optional existing transcript-frame-selector
  -> result-envelope v1
```

It does **not** reimplement yt-dlp, Whisper, direct media downloading, or frame extraction.

## When to use

- 「この動画を見て」の前処理を1つのCLIで揃えたい
- local video/audioのmetadataとtranscriptをまとめたい
- transcriptに対応する代表frameを既存helperで抜きたい
- downstream処理へ `result.json` の共通外箱を渡したい

If the task is specifically an X/Reddit/Futaba thread, use the dedicated reader/recipe first. This tool is for media, not a universal source router.

## Inputs

- existing local file
- direct HTTP(S) image/video/audio URL
- YouTube URL on Windows when `--browser` is supplied

## Modes

- `metadata`: acquisition + ffprobe only
- `transcribe`: metadata + `youtube-transcribe`
- `analyze` (default): transcribe + transcript-driven representative frames

`analyze` requires video with useful speech segments because it reuses `transcript-frame-selector`.

## Output

`--output-dir` contains produced artifacts and:

```text
result.json
acquired/
transcript/
frames/
```

`result.json` follows [`schemas/result-envelope-v1.md`](../../schemas/result-envelope-v1.md).

## Usage

Local video:

```powershell
py media_inspector.py .\clip.mp4 --mode analyze --language ja --model small --frame-count 6
```

Metadata only:

```powershell
py media_inspector.py .\clip.mp4 --mode metadata
```

Direct media URL:

```powershell
py media_inspector.py "https://example.com/video.mp4" --mode metadata
```

Browser-authenticated YouTube on Windows:

```powershell
py media_inspector.py "https://www.youtube.com/watch?v=..." --browser firefox --mode analyze
```

## Reused dependencies

- `ffprobe`
- `tools/web-media-fetcher/web_media_fetcher.py`
- `tools/browser-media-bridge/browser_media_bridge.ps1`
- `kavenio-youtube-transcribe` / `youtube-transcribe`
- `tools/transcript-frame-selector/transcript_frame_selector.py`
- `ffmpeg` through the frame selector

## Limitations

- Generic web pages are not discovered/scraped. A non-YouTube URL must resolve as actual media through `web-media-fetcher`.
- YouTube URL acquisition currently uses the Windows browser-auth bridge and therefore requires a usable local browser profile.
- `transcribe` / `analyze` require `youtube-transcribe`.
- `analyze` uses transcript segments; silent/music-only video needs a different frame-selection path.
- This tool produces local paths. Transporting private returned JPEGs into ChatGPT vision is a separate concern tracked in `AIUse-local-control`.
- No cache is implemented here yet. Cache should be added as a shared layer after the envelope has real usage.

## Verification

2026-08-26:

- Python syntax check PASS.
- local 1-second WAV -> `--mode metadata` -> ffprobe -> `result.json` PASS.
- result used `schema_version=1`, `source.type=audio`, `acquisition_path=local-file`.
- Network/browser/transcription branches reuse already-verified helpers, but the combined `media-inspector` path has not yet been live-smoked end-to-end.
