# RPLAY discovery / local save recipe

## Trigger

次の依頼で使う。

- 「RPLAYで〇〇を探して」
- 「このRPLAY配信者の公開リプレイ/動画を探して」
- 「このRPLAYの公開アーカイブをPCへ保存して」
- `rplay.live/live/<oid>` / `file/<oid>` / `play/<oid>` が素材候補として渡された

## Goal

RPLAYのJS描画・ログイン状態を通常Web検索へ無理に寄せず、ユーザーPCの既存Firefox sessionでDiscoveryする。候補は保存を試す前にaccess metadataで分類し、追加課金なしで利用できるものを通常shortlistへ優先する。

保存P0は、公開 `/play` アーカイブを既存RPLAY extractorでfull保存し、live/fileはFirefoxが実際に観測したmediaだけを扱う。

Discoveryとdownloadは別責務にする。

```text
natural-language request
  ↓
RPLAY Firefox-authenticated Discovery
  ↓
creator / live / file / play candidates
  ↓
access preflight
  ├─ public
  ├─ free_subscription
  ├─ paid_entitled / login_viewable
  ├─ paid_required
  ├─ restricted_unknown
  └─ drm
  ↓
default shortlist: additional payment不要を優先
  ↓ user selects
download-requests/*.json
  ↓
public /play → pinned RPLAY-aware yt-dlp → full save
live / file   → Firefox observed media → ffmpeg stream copy
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

RPLAYトップをFirefox既存profileで開き、表示中のsearch UIを解決してqueryを投入する。固定の非公開search URLを推測してハードコードしない。

2026-09-02実測では `ASMR` でRPLAY自身の `/search?keyword=ASMR&ct=roleplay&ct=JPchat` へ遷移し、creator候補を取得した。

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

Resultは `candidates.jsonl` と `manifest.json`。候補にはkind、content/creator OID、page URL、card text、access class等を含める。

## Access preflight / 課金切り分け

`/play` 候補はdownloadを試す前にmetadata-onlyで分類する。動画本体の取得をaccess判定に使わない。

### Stage A — anonymous metadata

RPLAY content metadataの `canView`、`viewableTiers`、`drm` を使う。

- `public`: 未ログインmetadataで `canView.url` がある。追加課金なし。
- `free_subscription`: `viewableTiers.free` がある。無料購読/無料joinが必要な場合はあるが金銭課金は不要。
- `paid_required`: non-free tierの明示的根拠があり、無料tierがない。
- `drm`: DRM。通常候補から除外。
- `restricted_unknown`: 閲覧不可だがtier根拠がない。private/region/other gateの可能性があるため、勝手に「有料」と断定しない。

signed `canView.url` 自体やraw tier payloadはresultへ返さない。

### Stage B — current Firefox account

Stage Aでpublicではない候補だけ、ログイン済みFirefox sessionから同じcontent metadataを再照会して `viewable_now` を確認する。これはmetadata-onlyであり、media bodyは取得しない。

- `viewable_now=true`: 今のaccountで閲覧可。
  - paid tier根拠があって既に権利を持つ場合は `paid_entitled`。新たな課金は不要。
  - tier根拠がなくloginだけで見られる場合は `login_viewable`。
- `viewable_now=false` + free tier: `free_subscription`。無料join候補として残す。
- `viewable_now=false` + paid tier: `paid_required`。通常shortlistから除外。
- `viewable_now=false` + tier不明: exact reasonは断定せずlocked扱いにして通常shortlistから除外。

JWT、requestor credential、signed `canView.url` はFirefox内でのみ扱い、Python/result/Actions logへ返さない。

### Default shortlist policy

通常探索では次を優先する。

- 含める: `public`, `login_viewable`, `paid_entitled`, `free_subscription`
- 除外する: `paid_required`, `drm`, authenticated `viewable_now=false` のunknown lock

`free_subscription` は「今すぐ見られる」とは限らないので、表示時は「無料購読が必要」と明示する。`paid_entitled` は既にaccountが権利を持っているので、追加課金候補としては扱わない。

2026-09-02 verificationでは、1つのRPLAY content pageから取得した9件の `/play` 候補が次のように分かれた。

```text
public:             2
free_subscription: 6
paid_required:     1
default shortlist: 8
```

つまりDL失敗を9回試すのではなく、metadata段階で有料1件だけ通常候補から落とせた。別creatorの4 replayでは authenticated `viewable_now=false` が2件、DRMが2件となり、通常shortlistは0件になった。

## Semantic shortlist

access preflight後の候補を、さらに依頼内容で絞る。

- ASMR / 雑談 / シチュボ等の内容語
- creator名
- title/card text
- live / file / play の種別
- `default_shortlist`
- `access_class`
- `viewable_now`

通常は `default_shortlist=true` を先に提示する。有料/locked候補も必要なら別枠で提示できるが、無料候補と混ぜない。

候補URLを保持して、ユーザーが「2番」等で選べる形にする。

## Public archive save — `/play`

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

公開 `/play` はRPLAY extractor実装済みのyt-dlp forkを再利用する。

- upstream yt-dlp PR: `yt-dlp/yt-dlp#10693`（未merge）
- build: `c-basalt/yt-dlp` release `rplaylive 2026.06.16.175612`
- Windows binary SHA-256: `6af3efcfc1076b6bcd81b9f68b64367e03b0faef2f925ff98b4afd82c3f7cbc2`
- cache: `%LOCALAPPDATA%\AIUse\bin\rplay-ytdlp\2026.06.16.175612\`
- global yt-dlpは置換しない

このextractorがRPLAY `canView`、HLS、RPLAY固有header/sign、暗号化HLS key取得、DRM判定を実装しているため自前再実装しない。

P0は **full archive saveのみ**。RPLAYの暗号化HLSではyt-dlp `--download-sections` が実測不安定だったため、`max_seconds`等の部分保存は `/play` では拒否する。

2026-09-02 verification:

```text
known-public /play full save: PASS
backend: rplay-ytdlp-pinned-public
container: MKV
bytes: 4,003,977
duration: 11.517 s
```

## Live / file save

`/live` または `/file` はユーザーの既存Firefox sessionで対象pageを通常renderし、browserが実際に取得したmediaだけを候補にする。

1. page上のvideo/audioを再生開始する。
2. `currentSrc` と Performance Resource Timingからmedia resourceを観測する。
3. HTTP-FLV / HLS / MP4等を選ぶ。
4. credential付きmedia URLはlocal process内だけに保持する。
5. `ffmpeg -c copy` でrequest-owned `.part.mkv` へ保存する。
6. 成功時だけfinal `.mkv`へrenameする。
7. `ffprobe`でsize/codec/durationを確認する。
8. `open_explorer=true`ならExplorerで保存fileを選択表示する。

2026-09-02にRPLAY liveのHTTP-FLV → ffmpeg stream copyを手動実証済み。

保存先:

```text
%USERPROFILE%\Videos\AIUse\RPLAY\<creator>\<timestamp>_<title>_<content-id>.mkv
```

## Credential boundary

RPLAYの再生resourceはURL queryに一時token、user id、session id等を含み得る。

- credential-bearing URLはGitHubへcommitしない。
- research result / download manifestへtokenを保存しない。
- URLをlog-safe化する際はtoken/userId/requestorOid/session/key類を除去する。
- Firefox cookie DB / local session secretをartifactへコピーしない。
- access preflightのJWTとsigned `canView.url`はbrowser内だけで使う。
- ffmpeg stderrはlocal captureし、URLをredactしてから必要最小の診断だけ出す。
- media binaryをGitHubへcommitしない。
- feature-branch download smoke resultをmainへ自動publishしない。

## Access boundary

アクセス制御は迂回しない。

- Discoveryのaccess preflightはmetadataだけを読む。
- public / free subscription / paid tier / current entitlementを区別する。
- exact gateが不明なlockを「有料」と推測しない。
- DRM → 停止。fallback禁止。
- 保存P0の `/play` はpublic archiveのみ。login/subscription/member限定 `/play` の自動保存は別contract。
- `/live` / `/file` → 現在ユーザーのFirefoxで通常閲覧でき、browserがmediaを実取得した場合だけ保存候補にする。
- 終了後に権限が変化したcontentを、過去のsigned URL/tokenで再取得しない。

## Failure routing

- search input not resolved → browser snapshotで現行UIを確認。非公開search URLを推測しない。
- candidate 0 → query no-resultと候補URL型の未対応を区別する。
- access probe error → paid/freeを推測せずunknownとして扱う。
- authenticated `viewable_now=false` → 通常shortlistから除外。tier根拠があればfree/paidを明示する。
- pinned yt-dlp digest mismatch → 実行せず停止。
- public `/play` access failure → login/subscription archiveとして停止。generic media fallbackへ流さない。
- DRM → 停止。
- media resource not detected → page上で実再生できるか確認し、Performance Resource Timing / media currentSrcを再probeする。
- ffmpeg 401/403 → pageから新規resourceを取り直す。同じexpired URLを反復しない。

## Completion

Discovery:

- Firefox login状態でRPLAY実ページをrenderした。
- `/play`候補へaccess preflightを付与した。
- 追加課金/locked/DRMを通常shortlistから分離した。
- credentialをresultへ漏らしていない。
- ユーザー意図に合わせてshortlistした。

Download:

- ユーザーが選んだpage URLと対応している。
- 公開 `/play` はpinned extractorでfull保存した。
- final fileが存在しsize > 0。
- ffprobe結果を確認した。
- media/tokenをGitHubへ返していない。
