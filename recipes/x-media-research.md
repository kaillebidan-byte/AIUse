# X media research recipe

## Trigger

次の依頼では検索・回答前にこのrecipeを読む。

- Xから画像 / 動画 / GIF / 2D animationを探す
- Xのmediaを本文に載せる、再生する
- X上の複数mediaを見比べて類似候補を探す
- login-required / sensitive Xも含めて深く探す
- 「この動画に似た動きを探す」のようなvisual-reference探索

## Core rule — three axes are independent

X mediaは必ず次の3軸を分離して扱う。

```text
access        = public | firefox_auth
inspection    = assistant | user_only
presentation  = none | inline | preview
```

- `access`: mediaを取得した方法。
- `inspection`: 探索・比較中にassistantが実pixel/frameを見たか。
- `presentation`: 最終回答でユーザーへどう見せるか。

**禁止する誤結合:**

- `firefox_auth => user_only`
- `possibly_sensitive => user_only`
- `adult account => user_only`
- `inline表示 => assistantも見た`

Firefoxのcookie/tokenはlocal PCに留め、取得済みmediaだけをassistant inspectionへ渡せる。

## Default research path

visual similarityやanimation qualityが目的なら、public / Firefox-authを問わず、扱える候補はassistantが実mediaを見てrerankする。

```text
X discovery
  ├─ keyword/query recall
  ├─ known-good seed creator/post
  └─ Firefox-auth graph/timeline discovery
          ↓
metadata recall
          ↓
明らかなノイズを除く
          ↓
assistant inspection batch
  ├─ image binary
  └─ video MP4 + representative contact sheet
          ↓
assistant visual rerank
          ↓
有望候補だけdense inspection / 再検索
          ↓
final candidates
          ↓
presentation marker
```

投稿文・bioだけで最終的なvisual類似度を決めない。

## Discovery strategy

### 1. `strategy=query` — broad recall

まだ良いcreator/postが1件も無い時に使う。

```json
{
  "mode": "x_search",
  "strategy": "query",
  "query": "pixel animation filter:videos",
  "limit": 50,
  "inspection": "assistant",
  "presentation": "none"
}
```

keyword queryは**候補発見用**であり最終rankingではない。`18+`, `NSFW`, `WIP`などを厳しくANDするほど品質が上がるとは限らない。実測では数字や無関係な語に引っ張られるfalse positiveが出た。

### 2. `strategy=seed_graph` — preferred after a good seed exists

人間が良い作家/作品を1件見つけた後の探索に近いroute。

```text
known-good creator
  ↓ x-cli timeline --media
そのcreatorのmedia
  ↓
following graph
  ↓
プロフィール語彙で関連creatorをrecall
  ↓ x-cli timeline --media
各creatorのmedia
  ↓
assistant visual inspection
```

request例:

```json
{
  "mode": "x_search",
  "strategy": "seed_graph",
  "seeds": ["creatorA", "creatorB"],
  "seed_timeline_limit": 30,
  "network_limit": 120,
  "neighbor_limit": 12,
  "neighbor_timeline_limit": 12,
  "inspection": "assistant",
  "presentation": "none",
  "inspection_candidate_limit": 20,
  "inspection_frame_count": 8
}
```

profile filteringはrecallだけに使う。成人向けcreator探索なら `NSFW`, `18+`, `no minors` 等と `animator`, `Live2D`, `pixel`, `artist` 等を使えるが、**最終採否は実mediaを見て決める**。

verified 2026-09-01 smoke:

```text
2 seeds
seed media timelines: 30 + 30
following scanned: 120 + 120
related creators retained: 12
candidate media posts: 192
assistant inspection batch: 20 media
```

実inspectionでは同じ成人向けcreator timeline内にもanimation referenceとして有用な作品と、単なるmeme/reaction clipが混在した。したがってgraph/profileだけで終了せずvisual rerankが必要。

x-cli自身の `timeline --media`, `following`, `discover/crawl` を優先して使い、自前crawlerを再発明しない。

## Firefox-auth assistant inspection

private `AIUse-local-control` の `x_search` requestは次を受ける。

```json
{
  "mode": "x_search",
  "strategy": "query",
  "query": "...",
  "limit": 50,
  "inspection": "assistant",
  "presentation": "none",
  "inspection_candidate_limit": 20,
  "inspection_media_per_post": 2,
  "inspection_frame_count": 8,
  "inspection_max_duration_seconds": 30,
  "inspection_max_media_mb": 25,
  "inspection_max_total_mb": 150
}
```

処理:

```text
Firefox auth cookies
  ↓ x-cli
x-search.jsonl
  ↓ prepare_x_inspection_batch.py
inspection/
  ├─ candidate-batch.json
  ├─ media/*
  └─ contact-sheets/*
  ↓ actions/upload-artifact
x-inspection-<request_id>
```

cookie / auth_token / ct0はartifactへ入れない。

inspection binaryはrepoへcommitしない。`inspection-summary.json`だけをresearch resultへ残す。

## Two-stage video inspection

大量候補を全frameで最初から見る必要はない。

### Recall inspection

- 画像: 原寸またはinspection用copy
- 短動画: 代表8frame程度のcontact sheet + MP4
- timeline metadataに尺が無い動画: download後にffprobeで実尺を測る
- 上限超過の長尺: 初回batchではskipし、別requestへ回す

### Dense inspection

上位候補だけ、必要区間を高密度にframe抽出して比較する。

短いloopなら最終段では全frame相当まで見ることを許容する。

## User-only preview is an exception

`inspection=user_only` は「login-required mediaの標準route」ではない。

使う例:

- ユーザーが明示的にAIへ渡したくない
- assistant inspection transportへ流さない例外候補
- 技術的にassistant-side binary transportが失敗し、ユーザー側だけなら表示できる

この場合のみ:

```text
media URL / metadata
  ↓ presentation marker
inspection=user_only
presentation=preview
  ↓ Tampermonkey
ユーザーだけpreview
  ↓ optional
AIへ渡す
```

`AIへ渡す` はcomposerへ添付するだけで自動送信しない。

## Presentation marker

presentationはinspection完了後の最終表示用。

通常のpublic:

```text
access=public
inspection=assistant
presentation=inline
```

Firefox-authだがassistant inspection済み:

```text
access=firefox_auth
inspection=assistant
presentation=inline
```

user-only escape hatch:

```text
access=firefox_auth
inspection=user_only
presentation=preview
```

`inspection=assistant` では `AIへ渡す` ボタンを表示しない。

## Sensitive / adult metadata

- X `possibly_sensitive` はbadge / metadataとして保持する。
- それだけで自動除外しない。
- 成人向け・きわどいという分類だけでassistant inspectionを止めない。
- 実際に扱えない対象や内容が明確な場合は、その候補自体を除外する。
- real-person identityを画像から推測しない。

## Query refinement

assistantが実mediaを見た後、そのvisual情報を次query / seedへ使う。

例:

```text
「キャラ中央固定」
「背景はほぼ静止」
「4～8frame級のloop」
「胴体より髪・腕の遅延motionが主体」
```

この特徴を投稿語彙、作者、hashtags、周辺アカウントへ写像して再検索する。

良いcreator/postを見つけたら、その後はgeneric keywordを厳しくするより `seed_graph` へ移ることを優先する。

モデルが見られなかったcandidateでも、metadataから得た作者・タグ・周辺語彙を使って同方向を探索継続できる。

## Completion

visual-reference探索の完成条件:

1. public / Firefox-authを必要に応じて探索した。
2. final候補の類似性をmetadataだけでなく実media inspectionで確認した。
3. ユーザー要求が表示を含むなら、画像またはvideo playerをChatGPT UIに出した。
4. `assistant inspection済み` と `user-only preview` を混同していない。
5. Firefox credential自体をassistant / repo / artifactへ搬送していない。

## Failure handling

- direct media download失敗: candidate-batchに理由を残し、別取得方法またはuser-only previewへ切り替える。
- ffmpeg無し: MP4自体はartifactへ残し、contact sheet不足を明示する。
- oversized/long media: recall batchで無理に処理せず、候補選定後のdense inspection requestへ回す。
- protected/deletedでユーザー自身にもアクセス権がない: 迂回しない。
