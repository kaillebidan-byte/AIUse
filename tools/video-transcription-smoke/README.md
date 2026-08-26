# video-transcription-smoke

Temporary/configurable live smoke input for evaluating existing video transcription tools before adopting them into AIUse.

Current candidate: `kavenio-youtube-transcribe` (yt-dlp + faster-whisper, local transcription).

Change only `request-url.txt` on a temporary branch, open a draft PR, and inspect `.github/workflows/video-transcription-live.yml` results. Do not treat this as a permanent wrapper until the live test passes and the user decides to adopt it.
