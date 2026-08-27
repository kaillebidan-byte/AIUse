# Twitch archive discovery / local download recipe

## Trigger

次のような依頼で使う。

- 「〇〇のTwitchアーカイブ探して」
- 「〇〇の雑談系VODを探して候補出して」
- 「この配信者の最近の○○っぽいアーカイブを探して」
- 候補提示後に「2番をDLしておいて」のようにPC保存へ繋げたい

## Goal

TwitchのVOD URLをユーザーに探させず、assistant側でchannelを特定し、archive一覧から候補を発見・意味的に絞る。選択されたVODはprivate local-control経由でユーザーPCへ直接保存する。

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
  ↓ user selects
download-requests/*.json
  ↓
local-download-request
  ↓
TwitchDownloaderCLI primary
  └─ known runtime failure → yt-dlp fallback
  ↓
%USERPROFILE%\Videos\AIUse\Twitch\
  ↓
Explorer selects saved file
```

Discoveryとdownloadは別責務として扱う。

- Discovery: `yt-dlp` のTwitch channel playlist extractorを再利用する。
- Primary download: `lay295/TwitchDownloader` の `TwitchDownloaderCLI`。
- Fallback download: `yt-dlp`。TwitchDownloaderの同一失敗を無条件に再試行しない。
- 動画本体はGitHubへcommitしない。

## Channel resolution

ユーザーがTwitch handleを明示していない場合、通常Web/Twitch page/公式SNS等からchannelを特定する。

強い候補が複数ある場合だけ候補を示す。十分に解決できるならhandleを聞き返さない。

## Local Discovery

private `AIUse-local-control` が利用できる場合、`research-requests/*.json` へ `twitch_archive_search` を送る。

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

通常は

```text
https://www.twitch.tv/<channel>/videos?filter=archives&sort=time
```

を `yt-dlp --flat-playlist` で列挙する。

`archives` が0件なら `all` fallbackを試せるが、2026-08-28実測ではTwitch/yt-dlpの `all` / `highlights` filterが0件を返すケースもあった。filter結果を絶対視せず、取得できたsourceをmanifestへ記録する。

## Semantic shortlist

ローカルbackendのhelper scoreは補助情報であり最終判定ではない。

「雑談系」「まったり」「近況話」「ゲーム前後のトーク」等はassistantがtitle、duration、view count、並び順、必要なら外部配信履歴を見て意味的に再ランキングする。

候補は番号付きにする。

```text
1. タイトルA — 2:31:10 — URL
2. タイトルB — 1:08:44 — URL
3. タイトルC — 4:12:03 — URL
```

ユーザーが「2番」「これ」と返したらshortlistとの対応を保持してURLをdownloadへ渡す。

## Direct download request

ユーザーが明確にDLを依頼した候補だけ、private `AIUse-local-control/download-requests/*.json` へ送る。

```json
{
  "request_id": "20260828-twitch-download-001",
  "mode": "download_local",
  "url": "https://www.twitch.tv/videos/1234567890",
  "title": "example title",
  "owner": "example_channel",
  "quality": "720p60",
  "open_explorer": true
}
```

専用 `.github/workflows/local-download-request.yml` が処理する。media analysis用workflowへ混ぜない。

## Quality policy

品質名は対象VODで実在確認してから指定する。TwitchDownloaderは存在しないquality指定を最高品質へfallbackし得るため、未確認文字列で比較しない。

2026-08-28 EliaStellaria `hello` VODの実在品質:

```text
1080p60
720p60
480p30
360p30
160p30
audio
```

運用目安:

- 画質優先: highest / 1080p60
- バランス: `720p60`
- 長尺・軽量保存: `480p30`

同VOD実測:

```text
10m 1080p60: ~726 MiB / 94.91s
10m 720p60 : ~232 MiB / 39.43s
full 4:31:40 480p30 via yt-dlp fallback:
  2,734,849,773 bytes (~2.55 GiB)
  537.49s (~8m57s)
```

## Primary backend — TwitchDownloaderCLI

Twitch VOD / Highlight direct downloadの第一経路は `TwitchDownloaderCLI`。

- Windows x64 releaseを `%LOCALAPPDATA%\AIUse\bin\twitchdownloader\`へcache。
- verified version: `1.56.5`。
- default threads: 4。
- `--collision Exit`。
- FFmpeg利用可能ならpathを渡す。
- partial benchmarkには公式 `--beginning / --ending` trimを使える。

## yt-dlp fallback

2026-08-28、同一の有効VODでTwitchDownloaderCLI 1.56.5が一時的に次を返した。

```text
GetOrGenerateVideoChapters NullReferenceException
GetQualityPlaylist: Invalid VOD, deleted/expired VOD possibly?
```

直前には同VODのquality probeとsegment downloadが成功しており、VOD自体は利用可能だった。同じ条件でTwitchDownloaderを繰り返さず、`yt-dlp`へfallbackしたところ `480p30` full downloadがPASSした。

fallback requestは `backend: "yt-dlp"` を指定する。TwitchではYouTube専用compat argsを付けない。

`yt-dlp` fallbackはHLS fragment並列数4を使用し、ローカルPowerShellへnative progress / speed / ETAを表示する。

## Local progress UI

長尺DLの進捗はChatGPTがpollし続けるのではなく、Windows側の別PowerShell窓へ表示する。

表示対象:

```text
percent
transferred size
speed
ETA
elapsed time
```

完了後はExplorerで保存ファイルを選択表示する。

## Cache policy

TwitchDownloaderの中断cacheは非常に大きくなる場合がある。2026-08-28の1080p60中断では約14.8GB残った。

TwitchDownloaderCLI 1.56.5には中断cacheを自動resumeするverified経路がない。不要と判断されたcacheはVOD ID単位でtargeted clearする。全cache一括削除をdefaultにしない。

## Access boundary

Subscriber-only等でOAuthが必要なVODは認証回避しない。local環境に正規アクセス権が無ければ取得不能として返す。

## Verification boundary — 2026-08-28

- channel archive Discovery: PASS
- candidate URL/title/duration/view count: PASS
- semantic shortlist → selected VOD: PASS
- TwitchDownloaderCLI acquisition/cache: PASS
- quality probe: PASS
- TwitchDownloaderCLI 1080p60/720p60 segment: PASS
- local progress PowerShell: PASS
- Explorer select/open: PASS
- targeted cache probe/clear: PASS
- TwitchDownloader transient runtime failure detection: PASS
- yt-dlp `480p30` full fallback, 4:31:40: PASS
- result manifest publish without video upload: PASS

## Completion

Discovery依頼:

- channelを特定した。
- Twitch archive一覧を実際に取得した、または取得不能理由を確認した。
- raw結果のままではなくユーザー意図に合わせてshortlistした。
- 各候補に直接VOD URLを保持した。

Download依頼:

- ユーザーが選んだ候補URLと対応している。
- primaryまたはfallback backendの終了成功を確認した。
- local fileの存在とsizeを確認した。
- `open_explorer=true`なら保存ファイルをExplorerで選択表示した。
- 動画本体をGitHubへ返していない。
