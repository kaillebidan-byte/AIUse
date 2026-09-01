# RPLAY discovery / local save recipe

## Trigger

次の依頼で使う。

- 「RPLAYで〇〇を探して」
- 「このRPLAY配信者の公開リプレイ/動画を探して」
- 「このRPLAYの公開アーカイブをPCへ保存して」
- `rplay.live/live/<oid>` / `file/<oid>` / `play/<oid>` が素材候補として渡された

## Goal

RPLAYのJS描画・ログイン状態を通常Web検索へ無理に寄せず、ユーザーPCの既存Firefox sessionでDiscoveryし、現在そのアカウントから通常閲覧できるmediaだけをローカル保存する。

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
Firefox rendered page + observed media resource
  ↓
ffmpeg stream copy
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

### Creator / content page discovery

既知のcreator/live URLがある場合はURLを直接渡す。

```json
{
  "request_id": "rplay-creator-example",
  "mode": "rplay_search",
  "url": "https://rplay.live/live/65e07e60850f4527aab74757",
  "expand_replays": true,
  "candidate_limit": 80
}
```

`expand_replays=true` では表示中UIに replay/archive/VOD 相当のtab/buttonがあれば開き、rendered DOMから `live / file / play` 候補を列挙する。

Resultは `candidates.jsonl` と `manifest.json`。候補にはkind、content id、page URL、card text等を含める。

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
  "url": "https://rplay.live/file/<content-id>",
  "owner": "creator-name",
  "title": "candidate-title",
  "open_explorer": true
}
```

`download_local` はRPLAY URLを `download_rplay_request.ps1` へrouteする。

1. 対象pageを既存Firefox profileでrenderする。
2. page上のvideo/audioを再生開始する。
3. `currentSrc` と browser Performance Resource Timingから実際にbrowserが取得したmedia resourceを観測する。
4. HTTP-FLV / HLS / MP4等の直接mediaを選ぶ。
5. credential付きmedia URLはlocal process内だけに保持する。
6. `ffmpeg -c copy` でrequest-owned `.part.mkv` へ保存する。
7. 成功時だけfinal `.mkv`へrenameする。
8. `ffprobe`でsize/codec/durationを確認しmanifestを出す。
9. `open_explorer=true`ならExplorerで保存fileを選択表示する。

保存先:

```text
%USERPROFILE%\Videos\AIUse\RPLAY\<creator>\<timestamp>_<title>_<content-id>.mkv
```

## Credential boundary

RPLAYの再生resourceはURL queryに一時token、user id、session id等を含み得る。

- credential-bearing URLはGitHubへcommitしない。
- research result / download manifestへtokenを保存しない。
- URLをlog-safe化する際はtoken/userId/session/key類を除去する。
- Firefox cookie DBやsession secretをartifactへコピーしない。
- media binaryをGitHubへcommitしない。

## Access boundary

このrouteはアクセス制御を迂回しない。

- 公開またはユーザーの通常loginで現在閲覧可能 → Discovery / save可。
- subscriber/member/paywallで現在のaccountに閲覧権がある → 通常page経由で取得できる範囲のみ。
- 現在のaccountに閲覧権がない → 取得不能として停止。
- 配信終了後に権限が変化したcontentを、過去のsigned URL/tokenで再取得する経路にはしない。

## Live note

`/live/<creator-oid>` も同じbackendでmedia resourceを観測でき、HTTP-FLV等なら録画できる。ただし現行 `local-download-request` workflowは長時間taskにtimeout上限があるため、P0の主目的はDiscoveryと通常長さの公開replay/file保存。長時間liveのdetached recorder化は別contractに分離する。

## Failure routing

- search input not resolved → browser snapshotで現行UIを確認してselectorを更新。非公開search APIを推測しない。
- candidate 0 → query no-resultとrender failureを区別する。
- media resource not detected → page上で実再生できるか確認し、Performance Resource Timing / media currentSrcの変化を再probeする。
- ffmpeg 401/403 → signed URL期限切れやaccess状態変化を疑い、Firefox pageから新規resourceを取り直す。同じexpired URLを反復しない。
- paywall/login wall → accountの正規アクセス範囲を超えて迂回しない。

## Completion

Discovery:

- Firefox login状態でRPLAY実ページをrenderした。
- queryまたはcreator pageから候補を実際に列挙した、または取得不能理由を特定した。
- credentialをresultへ漏らしていない。
- ユーザー意図に合わせてshortlistした。

Download:

- ユーザーが選んだpage URLと対応している。
- browserが実際に観測したmedia resourceを保存した。
- final fileが存在しsize > 0。
- ffprobe結果を確認した。
- media/tokenをGitHubへ返していない。
