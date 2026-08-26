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
- `yt-dlp`

未導入なら一度だけ:

```powershell
py -m pip install -U yt-dlp
```

Vivaldiはyt-dlpの `--cookies-from-browser` 対応browser。

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

## Security / handling

- cookie export fileは作らない。
- cookie値をstdoutへ出さない。
- browser profileやcookie DBをrepoへcopyしない。
- 取得したmediaだけ後段へ渡す。

## Failure interpretation

`--cookies-from-browser vivaldi` でも失敗する場合、次を区別する:

1. yt-dlp未導入/古い
2. Vivaldi profileの検出問題
3. browser側のlogin/sessionが古い
4. site側の追加bot/PO-token等の要求
5. region/age/availability等の動画固有制約

失敗時にcookie file exportへ即移らず、まず `yt-dlp -vU --cookies-from-browser vivaldi --simulate URL` のdebug情報で段階を確認する。

## Verification

2026-08-26: helper added. User-PC live probe pending.
