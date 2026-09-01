# RPLAY discovery / local save recipe

## Trigger

次の依頼で使う。

- 「RPLAYで〇〇を探して」
- 「このRPLAY配信者の公開リプレイ/動画を探して」
- 「このRPLAYの公開アーカイブをPCへ保存して」
- `rplay.live/live/<oid>` / `file/<oid>` / `play/<oid>` が素材候補として渡された

## Goal

RPLAYのJS描画・ログイン状態を通常Web検索へ無理に寄せず、ユーザーPCの既存Firefox sessionでDiscoveryし、現在通常閲覧できるmediaだけをローカル保存する。

Discoveryとdownloadは別責務にする。

```text
natural-language request
  ↓
RPLAY authenticated Discovery
  ↓
creator / live / file / play candidates
  ↓
assistant semantic shortlist
  ↓ user selects
download-requests/*.json
  ↓
/play public archive: pinned RPLAY-aware yt-dlp primary
  └─ access/unsupported等 → Firefox observed-media fallback
/live or /file: Firefox observed-media route
  ↓
local media file
  ↓
%USERPROFILE%\Videos\AIUse\RPLAY\<creator>\
```

## Discovery

private `AIUse-local-control` が使える場合、`research-requests/*.json` に `rplay_search` を送る。

### Keyword search

```json
{
  "request_id": "rplay-search-example",
  "mode": "rplay_search",
  "query": "ASMR",
  "candidate_limit": 80
}
```

RPLAYトップをFirefox既存profileで開き、表示中のsearch UIを解決してqueryを投入する。固定の非公開API endpointや検索URLを推測してハードコードしない。

2026-09-02実測では `ASMR` でRPLAY自身の `/search?keyword=ASMR&ct=roleplay&ct=JPchat` へ遷移し、creator候補を取得できた。

### Creator / content page discovery

既知のcreator/live URLがある場合はURLを直接渡す。

```json
{
  "request_id": "rplay-creator-example",
  "mode": "rplay_search",
  "url": "https://rplay.live/live/<creator-oid>",
  "expand_replays": true,
  "candidate_limit": 80
}
```

`expand_replays=true` ではtarget page内のbutton/tabだけを展開する。global Replay anchorはaccount Studioへ飛ぶため自動clickしない。

Resultは `candidates.jsonl` と `manifest.json`。候補にはkind、content/creator OID、page URL、card text等を含める。2026-09-02実測でcreator pageから複数の `/play/<content-oid>` を列挙できた。

## Semantic shortlist

raw候補をそのままユーザーへ投げず、依頼に合わせてassistantが絞る。

- ASMR / 雑談 / シチュボ等の内容語
- creator名
- title/card text
- live / file / play の種別
- 公開状態を実ページで確認できるか

候補URLを保持して、ユーザーが「2番」等で選べる形にする。

## Local save

ユーザーが保存対象を明示した場合だけ `download-requests/*.json` へ送る。

```json
{
  "request_id": "rplay-download-example",
  "mode": "download_local",
  "url": "https://rplay.live/play/<content-id>",
  "owner": "creator-name",
  "title": "candidate-title",
  "open_explorer": true
}
```

`download_local` はRPLAY URLを `download_rplay_request.ps1` へrouteする。

### Primary — public `/play` archive

公開 `/play` はRPLAY extractor実装済みのyt-dlp forkを再利用する。

- upstream yt-dlp PR: `yt-dlp/yt-dlp#10693`（未merge）
- build: `c-basalt/yt-dlp` release `rplaylive 2026.06.16.175612`
- Windows binary SHA-256を `6af3efcfc1076b6bcd81b9f68b64367e03b0faef2f925ff98b4afd82c3f7cbc2` に固定検証
- cache先: `%LOCALAPPDATA%\AIUse\bin\rplay-ytdlp\2026.06.16.175612\`
- global yt-dlpは置換しない

このextractorはRPLAY `canView`、HLS、RPLAY固有header/sign、暗号化HLS key取得、DRM判定を既に実装しているため自前再実装しない。DRMと判定されたcontentはfallbackして回避せず停止する。

### Fallback — Firefox observed media

primaryでpublic取得できない場合、またはlive/fileでは、ユーザーの既存Firefox sessionで対象pageを通常renderする。

1. page上のvideo/audioを再生開始する。
2. `currentSrc` と Performance Resource Timingからbrowserが実際に取得したmedia resourceを観測する。
3. HTTP-FLV / HLS / MP4等の直接mediaを選ぶ。
4. credential付きmedia URLはlocal process内だけに保持する。
5. `ffmpeg -c copy` でrequest-owned `.part.mkv` へ保存する。
6. 成功時だけfinal `.mkv`へrenameする。
7. `ffprobe`でsize/codec/durationを確認しmanifestを出す。
8. `open_explorer=true`ならExplorerで保存fileを選択表示する。

ffmpeg stderrはsigned URLをechoし得るためActions logへ継承せずlocal captureする。

保存先:

```text
%USERPROFILE%\Videos\AIUse\RPLAY\<creator>\<timestamp>_<title>_<content-id>.mkv
```

## Credential boundary

RPLAYの再生resourceはURL queryに一時token、user id、session id等を含み得る。

- credential-bearing URLはGitHubへcommitしない。
- research result / download manifestへtokenを保存しない。
- URLをlog-safe化する際はtoken/userId/session/key類を除去する。
- Firefox cookie DB / local session secretをartifactへコピーしない。
- ffmpeg/yt-dlp diagnosticsにcredentialを出さない。
- media binaryをGitHubへcommitしない。
- feature-branch download smoke resultをmainへ自動publishしない。

## Access boundary

このrouteはアクセス制御を迂回しない。

- 公開またはユーザーの通常loginで現在閲覧可能 → Discovery / save可。
- subscriber/member/paywallで現在のaccountに閲覧権がある → Firefox通常page経由で取得できる範囲のみ。
- 現在のaccountに閲覧権がない → 取得不能として停止。
- DRMと判定されたcontent → 停止。browser fallbackで回避しない。
- 配信終了後に権限が変化したcontentを、過去のsigned URL/tokenで再取得する経路にはしない。

## Live note

`/live/<creator-oid>` はFirefoxが観測したHTTP-FLV/HLS等を保存できる。2026-09-02にHTTP-FLV→ffmpeg stream copyを手動実証済み。

ただし現行 `local-download-request` workflowは長時間taskにtimeout上限があるため、P0の主目的はDiscoveryと通常長さのarchive/file保存。長時間liveのdetached recorder化は別contractに分離する。

## Failure routing

- search input not resolved → browser snapshotで現行UIを確認してselectorを更新。非公開search APIを推測しない。
- candidate 0 → query no-resultと候補URL型の未対応を区別する。
- pinned yt-dlp digest mismatch → 実行せず停止。tag名だけを信頼しない。
- yt-dlp access failure → 現在Firefoxで通常閲覧できるならobserved-media fallback。権限がなければ停止。
- DRM → 停止。fallback禁止。
- media resource not detected → page上で実再生できるか確認し、Performance Resource Timing / media currentSrcの変化を再probeする。
- ffmpeg 401/403 → signed URL期限切れやaccess状態変化を疑い、Firefox pageから新規resourceを取り直す。同じexpired URLを反復しない。

## Completion

Discovery:

- Firefox login状態でRPLAY実ページをrenderした。
- queryまたはcreator pageから候補を実際に列挙した、または取得不能理由を特定した。
- credentialをresultへ漏らしていない。
- ユーザー意図に合わせてshortlistした。

Download:

- ユーザーが選んだpage URLと対応している。
- public `/play`ならpinned extractor、必要時だけFirefox fallbackを使った。
- final fileが存在しsize > 0。
- ffprobe結果を確認した。
- media/tokenをGitHubへ返していない。
