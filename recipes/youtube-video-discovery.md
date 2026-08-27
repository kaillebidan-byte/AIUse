# YouTube video discovery / local save recipe

## Trigger

次のような依頼で使う。

- 「〇〇のYouTube動画探して」
- 「〇〇の雑談/解説/長尺動画を候補で出して」
- 「最近の〇〇動画をYouTubeで探して」
- 候補提示後に「2番をDLしておいて」のようにPC保存へ繋げたい

## Goal

YouTube URLをユーザーに探させず、assistant側でYouTube native searchから候補を取得し、意味的にshortlistする。選択された動画だけprivate local-control経由でユーザーPCへ直接保存する。

通常の目的は **発見→候補提示→保存** まで。文字起こし・映像解析は自動で追加しない。ユーザーが明示的に要求した場合だけheavy media analysis recipeへ進む。

## Architecture

```text
natural-language request
  ↓
query / creator terms resolution
  ↓
YouTube native Discovery
  ↓
raw video candidates
  ↓
assistant semantic rerank
  ↓
numbered shortlist
  ↓ user selects / clearly asks to download one
download-requests/*.json
  ↓
local-download-request
  ↓
Firefox-authenticated yt-dlp + Deno/EJS
  ↓
%USERPROFILE%\Videos\AIUse\YouTube\*.mp4
  ↓
Explorer selects saved file
```

Discoveryとdownloadは別責務として扱う。

## Discovery

private `AIUse-local-control` が利用できる場合、`research-requests/*.json`へ `youtube_search` を送る。

```json
{
  "request_id": "20260828-youtube-example",
  "mode": "youtube_search",
  "query": "creator name chat stream",
  "limit": 20,
  "sort": "relevance",
  "browser": "firefox",
  "authenticated": true
}
```

backendは既存 `yt-dlp` のnative searchを再利用する。

- `sort=relevance` → `ytsearchN:<query>`
- `sort=date` → `ytsearchdateN:<query>`
- default auth sourceはFirefox
- Firefox cookie extraction自体が一時的に失敗した場合だけpublic searchへfallback可能
- fallback有無はresultへ記録する

返す候補情報:

- video URL / id
- title
- channel / channel id
- duration
- view count（取得できる場合）
- upload date / timestamp（取得できる場合）
- live status
- thumbnail

optional filter:

- `min_duration_sec`
- `max_duration_sec`
- `channel_contains`

## Semantic shortlist

native searchのsource rankは検索engineの候補順であり最終判断ではない。

「雑談っぽい」「長尺」「解説中心」「ゲームより会話多め」のような曖昧な条件はassistantがtitle / channel / duration / views / date等から意味的に再ランキングする。

候補提示は番号付きにし、各候補のURLと`video_id`を内部で保持する。

```text
1. タイトルA — channel — 1:42:10 — URL
2. タイトルB — channel — 35:22 — URL
3. タイトルC — channel — 2:18:03 — URL
```

ユーザーが「2番」「これ」等と返したら、そのshortlistとの対応を保持してdownload requestへ渡す。

## Direct download

ユーザーが明確に保存を依頼した候補だけ `AIUse-local-control/download-requests/*.json` へ `download_local` requestを作る。

```json
{
  "request_id": "20260828-youtube-download-example",
  "mode": "download_local",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "video_id": "VIDEO_ID",
  "title": "Candidate title",
  "channel": "Channel Name",
  "browser": "firefox",
  "quality": "720p60",
  "open_explorer": true
}
```

`video_id`はshortlistから得られる場合はそのまま渡す。URL直指定時はlocal wrapperがwatch / youtu.be / shorts / live URLからIDを抽出する。

current backend:

```text
YouTube URL
  ↓
Firefox cookies
  ↓
yt-dlp + Deno/EJS compatibility
  ↓
local MP4
  ↓
Explorer /select
```

既存 `tools/browser-media-bridge/` と同じknown-good YouTube互換要素を使う。

- `--cookies-from-browser firefox`
- `--remote-components ejs:github`
- `youtube:player_client=default,web_embedded`
- Deno優先のJS runtime
- `--no-playlist`
- video bytesはlocal PCだけに保存

friendly quality examples:

- `best`
- `1080p60`
- `720p60`
- `720p`
- `480p30`

指定値は上限としてformat selectorへ変換する。取得可能なformatが異なる動画ではyt-dlpのformat selectionに従う。

## Local progress UI

実DL時はChatGPTが細かくpollするのではなく、Windows側の別PowerShell窓へyt-dlp progressを表示する。

```text
percent
transferred size
speed
ETA
elapsed time
```

完了後は`open_explorer=true`ならExplorerで保存ファイルを選択表示する。

## Heavy analysis boundary

通常のYouTube探索/保存では次を自動実行しない。

- Whisper / STT
- 全文文字起こし
- transcript生成
- frame extraction
- media-mcp vision analysis

ユーザーが「文字起こしして」「この場面を見て」「映像を解析して」のように明示した時だけ `video-transcription.md` / `video-analysis.md` を読む。

## Verification — 2026-08-28

### Discovery

Firefoxログイン状態を使い、次をlocal runnerで実証。

```text
query: OpenAI Codex
limit: 5
sort: relevance
browser: firefox
authenticated: true
```

結果:

```text
raw candidates: 5
returned candidates: 5
authenticated fallback to public: false
```

候補にはOpenAI公式動画を含み、URL / id / title / channel / duration / views / thumbnailを取得できた。

### Authenticated download probe

OpenAI公式 `Introducing the Codex Micro` (`m8uUUUsMD3Y`, 2:15) でFirefox-authenticated probeを実行。

```text
m8uUUUsMD3Y | Introducing the Codex Micro | OpenAI | 135
```

PASS。

### Actual local save E2E

同じOpenAI公式動画を`480p30`で実保存。

```text
bytes: 4,455,220
download elapsed: 9.33s
Explorer select/open: PASS
video bytes uploaded to GitHub: no
```

最初のE2Eではwrapperのwatch-URL ID parserがファイル名用IDを`youtube`へfallbackしたが、download自体は正常だった。直後にparserを修正し、`video_id`をshortlistから明示的に渡せるようにもした。

## Completion

Discovery:

- native YouTube searchを実行した。
- raw候補をそのまま投げず、ユーザー意図でshortlistした。
- 各番号とYouTube URL / video idの対応を保持した。

Download:

- ユーザーが選択した候補とURLが一致している。
- Firefox-authenticated yt-dlp backendへ渡した。
- local fileの存在とnon-zero sizeを確認した。
- `open_explorer=true`なら保存ファイルをExplorerで選択表示した。
- 動画本体をGitHubへ返していない。

Heavy analysis:

- 通常のDiscovery/Download完了条件には含めない。
