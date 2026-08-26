# Video transcription recipe

## Trigger

次の依頼ではこのrecipeを読む。

- 「この動画を見て / 内容を教えて / 要約して」
- 「動画を文字起こしして」
- YouTube / X / Bilibili / Reddit等の動画で、字幕や本文だけでは内容確認が足りない
- 動画内の発話を後続の検索・翻訳・分析に使いたい

## Preferred existing implementation

新しいWhisper wrapperを自作する前に `kavenio-youtube-transcribe` を優先候補として使う。

Upstream: `kaveniohq/youtube-transcribe`

理由:
- `yt-dlp + faster-whisper` を一つのCLIにまとめている。
- URLとローカル動画の両方を入力できる。
- `transcript.md`、versioned `transcript.json`、`timestamps.vtt` を生成できる。
- Codex / Claude向けAgent Skillも同梱。
- transcription API key不要。

## Known-good STT path

2026-08-26にGitHub Actions上で実証済み。

```text
local MP4
  ↓
FFmpegで音声抽出
  ↓
kavenio-youtube-transcribe 0.2.0
  ↓
faster-whisper tiny
  ↓
transcript.md
transcript.json
timestamps.vtt
```

Known fixture:
- whisper.cpp `samples/jfk.wav` を短いMP4へ包んで入力。
- Whisper `tiny`, language=`en`。
- 出力文: `And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.`
- Markdown / JSON / VTT生成までPASS。

## YouTube acquisition boundary and local workaround

2026-08-26実測では、GitHub-hosted Actions runnerからYouTube URLを `yt-dlp` で取得すると、

`Sign in to confirm you’re not a bot`

で失敗した。

これはWhisper失敗ではなく **YouTube取得段階の実行環境/IP境界**。

同日、ユーザーWindows PCのログイン済みVivaldiを使うlocal pathはPASSした。

Known-good acquisition:

```text
logged-in Vivaldi
  ↓ --cookies-from-browser vivaldi
Deno + EJS challenge solver
  ↓
yt-dlp local Windows execution
  ↓
full MP4 with video + audio
```

Test input:
`https://www.youtube.com/watch?v=8C87qprkCpE`

Probe result:

```text
Youtube 8C87qprkCpE 期間限定イベント「新年着せ替え2026」アニメイメージPV 26
```

Full MP4 download and user playback: video + audio PASS.

YouTubeのcurrent compatibility detailsとhelperは `tools/browser-media-bridge/README.md` を参照する。

したがってYouTube動画については次の順で扱う。

1. ChatGPT/web側で十分な字幕・transcriptが取得できるならそれを使う。
2. 実音声・実映像が必要なら、GitHub-hosted runnerで再試行せず `browser-media-bridge` を使ってユーザーPC上でlocal file化する。
3. 取得済みlocal fileを `youtube-transcribe` に渡す。
4. timingが必要なら `--timestamps` を付ける。
5. 映像確認も必要なら `video-analysis.md` へ接続し、重要timestampだけframe抽出する。

## Local-video dependency

local video入力ではFFmpegが必要。

GitHub Actionsの今回のrunnerにはFFmpegが初期状態で入っていなかったため、明示的installが必要だった。`youtube-transcribe doctor` がPython / yt-dlp / faster-whisper / DenoをPASSしても、local video処理前には `ffmpeg -version` も別途確認する。

## Completion

文字起こしtaskは次を満たすまで完了扱いにしない。

- 実際の音声からtranscriptを取得した、またはplatform提供字幕を使ったことを区別して把握する。
- requested contentを読める本文へ変換する。
- timingが必要な依頼ではJSON/VTT等のtimestamp artifactまで取得する。
- download失敗とspeech-to-text失敗を混同しない。

## Next extension

動画内容を「聞く」だけで足りない場合は、transcriptの不確実箇所・指示語・重要timestampだけframe抽出する方式を優先する。全編を無差別に1fpsでvisionへ投げない。
