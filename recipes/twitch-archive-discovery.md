# Twitch archive discovery recipe

## Trigger

次のような依頼で使う。

- 「〇〇のTwitchアーカイブ探して」
- 「〇〇の雑談系VODを探して候補出して」
- 「この配信者の最近の○○っぽいアーカイブを探して」
- 候補提示後に「2番をDLしておいて」のようにPC保存へ繋げたい

## Goal

TwitchのVOD URLをユーザーに探させず、assistant側でchannelを特定し、Twitchのarchive一覧から候補を発見し、意味的に候補を絞る。その後、選ばれたVODをprivate local-control経由でユーザーPCへ直接保存する。

## Architecture

```text
natural-language request
  ↓
channel / handle resolution
  ↓
Twitch archive Discovery
  ↓
raw VOD candidates
  ↓
assistant semantic rerank
  ↓
numbered shortlist
  ↓ user selects / clearly asks to download one
download-requests/*.json
  ↓
local-download-request
  ↓
TwitchDownloaderCLI
  ↓
local PC video folder
  ↓
Explorer selects saved file
```

Discoveryとdownloadは別責務として扱う。

- Discovery: `yt-dlp` の現行 Twitch channel playlist extractorを再利用する。
- Download: `lay295/TwitchDownloader` の `TwitchDownloaderCLI` を再利用する。
- TwitchDownloaderCLIにchannel search機能を再実装しない。
- yt-dlpをTwitch VOD本体の第一download backendにはしない。VOD/Highlight直DLは専用TwitchDownloaderCLIを優先する。

## Channel resolution

ユーザーがTwitch handleを明示していない場合、まず通常Web/Twitch page/source検索でchannelを特定する。

強い候補が複数ある場合だけ候補を示す。表示名、公式リンク、他SNSからTwitch handleを十分に解決できるならユーザーへhandleを聞き返さない。

## Local Discovery request

private `AIUse-local-control` が利用できる場合、`research-requests/*.json` へ `twitch_archive_search` を送る。

例:

```json
{
  "request_id": "20260828-twitch-example",
  "mode": "twitch_archive_search",
  "channel": "example_channel",
  "query": "雑談系",
  "keywords": ["雑談", "chat", "talk", "just chatting"],
  "max_scan": 50,
  "candidate_limit": 20,
  "prefer_full_vods": true
}
```

backendはまず

```text
https://www.twitch.tv/<channel>/videos?filter=archives&sort=time
```

を `yt-dlp --flat-playlist` で列挙する。

Twitch/yt-dlp側のarchives filterが空になるケースへ備え、0件なら `filter=all` へfallbackする。fallbackした場合はmanifestへ記録する。

2026-08-28のlocal-runner smokeでは `spamfish` の `filter=archives` が0件になり、`filter=all` fallbackからVOD URL / title / duration / view count / thumbnailを取得してPASSした。

## Semantic shortlist

ローカルbackendの `helper_score` は補助情報であり、最終判定ではない。

helperはtitle keyword一致に加え、`prefer_full_vods=true`なら長時間VODを少し上げ、10分未満や`Highlight:`を下げる。これはshort clip混入を減らすための粗いpriorに留める。

「雑談系」「まったり」「近況話」「ゲーム前後のトーク」のような曖昧な意図はassistantが候補タイトル、長さ、view count、並び順、必要なら追加sourceを見て意味的に再ランキングする。

候補提示は番号付きにする。

```text
1. タイトルA — 2:31:10 — URL
2. タイトルB — 1:08:44 — URL
3. タイトルC — 4:12:03 — URL
```

ユーザーが「2番」「これ」などと返したら、このshortlistとの対応を保持してURLをdownloadへ渡す。

## Direct download

ユーザーが明確にDLを依頼した候補だけ、private `AIUse-local-control/download-requests/*.json` へ `download_local` requestを作る。

例:

```json
{
  "request_id": "20260828-twitch-download-001",
  "mode": "download_local",
  "url": "https://www.twitch.tv/videos/1234567890",
  "open_explorer": true
}
```

これを専用 `.github/workflows/local-download-request.yml` が処理する。media analysis用 `requests/*.json` / `local-media-request` へ混ぜない。

current Twitch backend:

```text
Twitch VOD URL
  ↓
TwitchDownloaderCLI videodownload
  ↓
%USERPROFILE%\Videos\AIUse\Twitch\*.mp4
  ↓
explorer.exe /select,<saved file>
```

動画本体はGitHub repoへcommitしない。private resultへ返すのはlocal path、title、VOD id、size等のsmall manifestだけ。

## Download backend

Twitch VOD / Highlight direct downloadは `lay295/TwitchDownloader` のWindows x64 CLI releaseを使う。

- local-control側でlatest Windows x64 release assetを必要時に取得し、`%LOCALAPPDATA%\AIUse\bin\twitchdownloader\`へcacheする。
- 2026-08-28に `TwitchDownloaderCLI 1.56.5` の取得・起動・VOD `info --format raw` metadata probeをlocal runnerでPASS。
- VOD IDはURLから保持し、raw metadataからtitle / owner / createdAt等を取得する。
- defaultはhighest available quality。
- `quality`指定がある場合だけCLIへ渡す。
- download threadsは4をdefaultとする。
- output collisionは対話promptを出さないようlocal-control側でunique filenameを作り、CLIへ`--collision Exit`を渡す。
- FFmpegが利用可能ならCLIへpathを渡す。

Subscriber-only等でOAuthが必要なVODは、通常public VODと同じ扱いで認証回避しない。必要な正規アクセス権がlocal環境に無い場合は取得不能として返す。

## Verification boundary

2026-08-28時点:

- channel archive Discovery: PASS
- candidate URL/title/duration/view count return: PASS
- archives -> all fallback: PASS
- TwitchDownloaderCLI Windows x64 acquisition/cache: PASS
- selected VOD URL -> TwitchDownloaderCLI metadata resolution: PASS
- dedicated lightweight download workflow: PASS through backend + result publish in `probe_only` mode
- actual MP4 full download + Explorer selection: **pending first user-selected VOD**

テスト用の第三者VODを勝手に本体downloadしてverificationを埋めない。ユーザーが実際に選んだ候補を最初のfull-download E2Eに使う。

## Completion

Discovery依頼:

- channelを特定した。
- Twitch archive一覧を実際に取得した、または取得不能理由を確認した。
- raw検索結果のままではなくユーザー意図に合わせてshortlistした。
- 各候補に直接VOD URLを保持した。

Download依頼:

- ユーザーが選んだ候補URLと対応している。
- TwitchDownloaderCLIの終了成功を確認した。
- local fileの存在を確認した。
- `open_explorer=true`なら保存ファイルをExplorerで選択表示した。
- 動画本体をGitHubへ返していない。
