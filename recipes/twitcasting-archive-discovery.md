# TwitCasting archive discovery / local save recipe

## Trigger

次のような依頼で使う。

- 「〇〇のツイキャス配信一覧を見たい」
- 「〇〇のTwitCasting録画を探して」
- 「雑談っぽい録画を候補で出して」
- 候補提示後に「2番をDLして」のようにPC保存へ繋げたい

## Goal

TwitCastingのmovie URLをユーザーに探させず、channel / handleを解決してarchiveから視聴可能な録画候補を列挙する。候補はassistantが意味的にshortlistし、ユーザーが選択したmovieだけFirefoxログインを使ってlocal PCへ保存する。

Discoveryとdownloadは分離する。文字起こし・frame解析は通常routeへ混ぜない。

## Architecture

```text
natural-language request
  ↓
TwitCasting channel / handle resolution
  ↓
private AIUse-local-control: twitcasting_archive_search
  ↓
Firefox cookies + yt-dlp TwitCastingUserIE (/archive)
  ↓
movie URL / title / duration / date 等
  ↓
assistant semantic shortlist
  ↓ user selects one
download-requests/*.json
  ↓
local-download-request
  ↓
Firefox cookies + yt-dlp TwitCastingIE (/movie/<id>)
  ↓
%USERPROFILE%\Videos\AIUse\TwitCasting\
  ↓
optional Explorer /select
```

## Discovery

private `AIUse-local-control` が利用できる場合、`research-requests/*.json`へ `twitcasting_archive_search` を送る。

```json
{
  "request_id": "20260828-twitcasting-example",
  "mode": "twitcasting_archive_search",
  "channel": "example_user",
  "query": "雑談",
  "keywords": ["雑談", "まったり", "talk"],
  "max_scan": 30,
  "candidate_limit": 20,
  "browser": "firefox",
  "authenticated": true,
  "allow_public_fallback": false
}
```

通常sourceは:

```text
https://twitcasting.tv/<channel>/archive
```

`yt-dlp` のTwitCastingUserIEを再利用し、各movieをTwitCastingIEで解決する。Firefoxに正規ログイン済みなら `--cookies-from-browser firefox` を利用する。cookie export fileは作らない。

返す候補情報:

- movie URL / id
- title
- uploader id
- duration
- upload date / timestamp
- thumbnail
- view count（取得できる場合）
- live status

同一movieがsource側から複数回返る場合はmovie IDで重複排除する。

合言葉付き録画など、現在の正規セッションだけでは解決できないentryは候補へ偽装せず、partial extractor errorとして記録する。既知の合言葉が明示的に与えられた場合を除き、認証回避はしない。

## Semantic shortlist

source順をそのまま最終ランキングにしない。「雑談」「長め」「近況話」等の意味条件はassistantがtitle / duration / date等から再ランキングする。

候補は番号付きで提示し、movie URL / idとの対応を保持する。

```text
1. タイトルA — 1:08:12 — https://twitcasting.tv/user/movie/123
2. タイトルB — 42:31 — https://twitcasting.tv/user/movie/456
```

## Direct download

ユーザーが選択したmovieだけ `download_local` へ渡す。

```json
{
  "request_id": "20260828-twitcasting-download-example",
  "mode": "download_local",
  "url": "https://twitcasting.tv/example_user/movie/123456789",
  "title": "Candidate title",
  "channel": "example_user",
  "browser": "firefox",
  "authenticated": true,
  "quality": "best",
  "open_explorer": true
}
```

current backend:

```text
TwitCasting movie URL
  ↓
Firefox cookies
  ↓
yt-dlp TwitCastingIE
  ↓
HLS / mp4 local save
  ↓
%USERPROFILE%\Videos\AIUse\TwitCasting\
```

YouTube専用のDeno / EJS / player_client互換argsはTwitCastingへ付けない。

friendly quality examples:

- `best`
- `1080p60`
- `720p60`
- `720p`
- `480p30`

対象録画に存在しない品質ではyt-dlpのformat selectionへfallbackする。

## Probe before heavy save

新規経路・アクセス条件が怪しいmovieでは、必要なら `probe_only: true` で動画本体を保存せずmetadata / extractor到達を確認できる。

```json
{
  "request_id": "20260828-twitcasting-probe-example",
  "mode": "download_local",
  "url": "https://twitcasting.tv/example_user/movie/123456789",
  "browser": "firefox",
  "authenticated": true,
  "probe_only": true,
  "open_explorer": false
}
```

## Failure interpretation

取得失敗を全部login failureへまとめない。

- password protected: 合言葉必須。勝手に回避しない。
- login/session issue: Firefox session/profileを確認。
- `Failed to get m3u8 playlist`: TwitCasting / yt-dlp extractor固有failureとして区別する。
- deleted/unavailable: source側で視聴不可。
- partial archive errors: archive内の一部entryだけ解決不能。取得できた候補まで捨てない。

## Verification — 2026-08-28

`馬鹿猫メイドもゆ` / `z6kr0` でlocal Windows runner E2Eを実施。

Discovery:

```text
source: https://twitcasting.tv/z6kr0/archive
browser: firefox
authenticated: true
raw extracted entries: 6
duplicates removed: 3
unique usable recordings: 3
```

得られた録画:

```text
839570222 — 10:32
839568883 — 15:06
839554769 — 11:21
```

別entry `839970789` は `This video is protected by a password` と明示され、候補へ混ぜずpartial errorとして記録した。

Download route probe:

```text
movie: 839568883
browser: firefox
authenticated: true
result: PASS
id: 839568883
uploader: z6kr0
duration: 906s
is_live: false
```

日本語titleのUTF-8出力も確認済み。動画bytesのfull-save E2Eはこのverificationでは実行していない。

## Completion

Discovery:

- channel / handleを解決した。
- Firefox認証付きarchive Discoveryを実行した。
- 重複を除去し、アクセス不能entryを区別した。
- raw候補をユーザー意図でshortlistした。
- 各候補にmovie URL / idを保持した。

Download:

- ユーザーが選択したmovie URLと一致している。
- Firefox-authenticated yt-dlp routeへ渡した。
- full save時はlocal fileの存在とnon-zero sizeを確認する。
- `open_explorer=true`なら保存ファイルをExplorerで選択表示する。
- 動画本体をGitHubへ返さない。
