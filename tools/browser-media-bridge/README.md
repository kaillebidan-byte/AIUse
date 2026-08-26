# browser-media-bridge

## Purpose

ユーザーPC上の既存ブラウザログインを `yt-dlp --cookies-from-browser` で再利用し、YouTube等の取得をGitHub-hosted runnerのbot判定から切り離すためのWindows向けhelper。

想定環境はWindows + Vivaldi。cookie自体をファイルへexportせず、その場でブラウザprofileから読み取る。

## When to use

- GitHub Actions上のyt-dlpが `Sign in to confirm you’re not a bot` で失敗した。
- ユーザーPCのVivaldiでは対象siteへログイン済み。
- 動画/音声をlocal file化して、その後 `video-transcription` / `video-analysis` へ渡したい。

## Dependency

- PowerShell
- `yt-dlp[default]`
- current YouTube JS challenge用runtime: Deno推奨
- video/audio mergeにはffmpeg

未導入なら一度だけ:

```powershell
py -m pip install -U "yt-dlp[default]"
winget install --id=DenoLand.Deno
```

Deno導入後は新しいPowerShellを開く。

Vivaldiはyt-dlpの `--cookies-from-browser` 対応browser。

## Current YouTube compatibility

2026-08-26実測では、単純な `--cookies-from-browser vivaldi` だけだとYouTube側のJS challengeで

```text
n challenge solving failed
The page needs to be reloaded.
```

となった。

known-goodでは次を併用する:

```text
--js-runtimes deno
--remote-components ejs:github
--extractor-args "youtube:player_client=default,web_embedded"
```

この互換処理は `browser_media_bridge.ps1` 内へ寄せ、呼び出し側が毎回覚えなくてよい形にする。

## First probe

downloadせず、Vivaldi cookieでmetadata取得だけ確認する:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\browser-media-bridge\browser_media_bridge.ps1 `
  "https://www.youtube.com/watch?v=8C87qprkCpE" `
  -Mode probe
```

成功時は extractor / video id / title / duration が出る。

## Download

Audio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\browser-media-bridge\browser_media_bridge.ps1 URL -Mode audio
```

Video:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\browser-media-bridge\browser_media_bridge.ps1 URL -Mode video
```

Default output:

```text
%TEMP%\AIUse\browser-media-bridge\
```

## Known-good live verification

2026-08-26, Windows + logged-in Vivaldi + Python 3.12 + yt-dlp + Deno:

Input:
`https://www.youtube.com/watch?v=8C87qprkCpE`

Probe result:

```text
Youtube 8C87qprkCpE 期間限定イベント「新年着せ替え2026」アニメイメージPV 26
```

Full video download result:

```text
C:\Users\kaill\AppData\Local\Temp\AIUse\yt-video\8C87qprkCpE.mp4
```

User playback verification: **映像 + 音声ともにPASS**。

したがって現時点のYouTube known-good acquisition pathは:

```text
logged-in Vivaldi
  ↓ cookies-from-browser
Deno + EJS challenge solver
  ↓
yt-dlp local Windows execution
  ↓
full MP4 with video + audio
  ↓
video-transcription / video-analysis
```

GitHub-hosted runnerでYouTube bot checkを再試行するより、このlocal acquisition pathを優先する。

## Security / handling

- cookie export fileは作らない。
- cookie値をstdoutへ出さない。
- browser profileやcookie DBをrepoへcopyしない。
- 取得したmediaだけ後段へ渡す。

## Failure interpretation

`--cookies-from-browser vivaldi` でも失敗する場合、次を区別する:

1. yt-dlp未導入/古い
2. JS runtime / EJS challenge solver不足
3. Vivaldi profileの検出問題
4. browser側のlogin/sessionが古い
5. site側の追加bot/PO-token等の要求
6. region/age/availability等の動画固有制約

失敗時にcookie file exportへ即移らず、まずchallenge/runtime/client/profileのどの層かを切り分ける。

## Verification

2026-08-26: user-PC live metadata probe PASS; full YouTube MP4 download and playback with video + audio PASS.
