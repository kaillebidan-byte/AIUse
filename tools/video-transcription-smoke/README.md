# video-transcription-smoke

既存の動画文字起こし実装をAIUseへ採用する前後に、実ネットワーク境界とlocal STT本体を分離して確認するsmoke harness。

## Current implementation

`kavenio-youtube-transcribe` (`yt-dlp + FFmpeg + faster-whisper`) を利用する。自前Whisper wrapperは作らない。

詳細な作業導線とfailure ledgerは `../../recipes/video-transcription.md` を正本とする。

## Configurable input

`request-url.txt` にYouTube URLを1件置く。

`.github/workflows/video-transcription-live.yml` は二つを別々に確認する。

1. **YouTube acquisition probe** — URLからyt-dlpで音声取得できるか。失敗してもjob全体は止めない。
2. **Known local-video transcription** — whisper.cppのJFK音声をMP4に包み、実際にfaster-whisperへ通す。

この分離は必須。download失敗をspeech-to-text失敗として扱わない。

## Verification — 2026-08-26

### Local transcription: PASS

GitHub Actions / Ubuntu / Python 3.11で:

- `kavenio-youtube-transcribe 0.2.0`
- `faster-whisper 1.2.1`
- model `tiny`
- local MP4 input
- `transcript.md`
- `transcript.json`
- `timestamps.vtt`

を実生成した。

認識結果:

`And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.`

### YouTube URL acquisition on GitHub-hosted runner: BLOCKED

Azur Lane公式PV `8C87qprkCpE` をknown probeにしたところ、yt-dlpは:

`Sign in to confirm you’re not a bot`

で停止した。これはYouTube/GitHub-hosted runner間の取得境界でありWhisper不良ではない。同じrunnerから無認証で繰り返し試さない。

### FFmpeg dependency

local video入力にはFFmpegが必要。今回のGitHub runnerでは初期状態でPATHになく、明示install後にPASSした。`youtube-transcribe doctor` のPASSだけでlocal-video経路の準備完了と判断しない。
