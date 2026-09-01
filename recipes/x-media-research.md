# X media research recipe

## Trigger

Xの画像 / 動画 / GIF / 2D animationを探す、比較する、本文に載せる依頼で読む。

## First rule — ordinary media stays ordinary

**「画像を探して」「この作者の画像を何枚か」のような普通の依頼で、local runner / Firefox-auth / inspection ZIP / dense frame解析を標準起動しない。**

通常の公開mediaは、まず通常のWeb / image search / X公開resolverで探し、必要な候補だけ見る。

```text
ordinary public image/video request
  ↓
normal Web / image / X public discovery
  ↓
assistantが必要な候補を確認
  ↓
通常表示またはinline marker
```

重い経路を使うのは、通常経路では目的を満たせない時だけ。

例:

- X loginが必要
- public searchでは候補が不足する
- sensitive表示を含む深掘りが必要
- 多数動画を実frameで比較してquality / similarity rerankする必要がある
- ユーザーが明示的に深掘りを要求した

## Media state

必要な場合だけ次の3軸を独立して記録する。

```text
access        = public | firefox_auth
inspection    = assistant | user_only
presentation  = none | inline | preview
```

- `access`: 取得方法。
- `inspection`: assistantが実pixel/frameを見たか。
- `presentation`: ユーザーへどう表示するか。

次を自動的に同一視しない。

- `firefox_auth => user_only`
- `possibly_sensitive => user_only`
- `adult account => user_only`
- `inline表示 => assistantも見た`

Firefox cookie / tokenはlocal PCに留める。

## Normal route

公開されていて通常取得できるmediaは、普通にassistantが確認してよい。

```text
access=public
inspection=assistant
presentation=inline
```

Xの公開mediaを探すだけなら、原則これで終える。

`possibly_sensitive` や成人向けprofileというmetadataだけを理由に、独自の事前ブロックや大掛かりな隔離処理を追加しない。通常の入力経路で扱えるならそのまま扱う。

## User-only preview route

**本文ではユーザーだけに見せたい候補**は `AIUSE_X_MEDIA_V1` markerを使う。

主な用途:

- login済みFirefoxで取得した候補を、まずユーザー側だけで確認したい
- 内容が曖昧で、assistantへ明示的に渡す前にユーザーが選別したい
- assistant-side transportへ流さず、metadata / 作者 / 周辺情報だけで探索を続けたい

```text
media URL / metadata
  ↓
AIUSE_X_MEDIA_V1
inspection=user_only
presentation=preview
  ↓ Tampermonkey
user-side preview
```

**v0.3.1以降は表示された全media cardに `AIへ渡す` を出す。**

`AIへ渡す` はmediaをChatGPT composerへ添付する操作であり、自動送信しない。ユーザーが必要な候補だけ後からassistantへ渡せる。

例:

```text
access=firefox_auth
inspection=user_only
presentation=preview
```

## Deep visual research — optional

visual similarity / animation qualityを本当に比較する必要がある場合だけ、private `AIUse-local-control` の `x_search` とinspection artifactを使える。

```text
X native discovery
  ↓
metadata recall
  ↓
small inspection batch
  ├─ image
  └─ MP4 + contact sheet
  ↓
assistant visual rerank
  ↓
final candidates
```

これは**普通の画像検索の標準routeではない**。

良いcreator/postが既にある場合はgeneric keywordを厳しくするより `strategy=seed_graph` を使う。profile、followers、Patreon / Ci-en等の継続活動シグナルはcreator recallのpriorとして使えるが、品質の最終判定は実mediaで行う。

動画は最初から全frame展開せず、必要なら代表frame → 上位だけdense inspectionの順でよい。

inspection artifactにはcookie / auth_token / ct0を入れない。binaryはrepoへcommitしない。

## Sensitive / adult handling

- `possibly_sensitive` はmetadata / badgeとして保持してよい。
- adult / NSFW profileだけで候補を自動除外しない。
- 独自の「安全そうか」事前分類で探索品質を落とさない。
- 通常のassistant inputとして扱える候補は普通に確認する。
- 本文ではassistantに見せない形にしたい候補は `inspection=user_only` markerへ回す。
- 通常の入力処理で扱えない候補を迂回して強制的にassistantへ渡そうとしない。
- real-person identityを画像から推測しない。

## Presentation marker

markerは**表示方法**であって、取得方法やinspection方法そのものではない。

通常表示例:

```text
access=public
inspection=assistant
presentation=inline
```

Firefox-auth取得済みで通常表示する例:

```text
access=firefox_auth
inspection=assistant
presentation=inline
```

ユーザーだけpreviewする例:

```text
access=firefox_auth
inspection=user_only
presentation=preview
```

いずれのcardにもv0.3.1以降は `AIへ渡す` を表示する。

## Completion

通常の画像探索:

1. 必要十分な候補を普通の経路で探した。
2. 不要なlocal runner / ZIP / browser fallbackを起動していない。
3. 表示要求があればmediaを見える形で出した。

深いX media探索:

1. publicだけで不足する場合のみFirefox-auth等へ拡張した。
2. visual quality / similarityが重要なら実mediaで確認した。
3. `assistant inspection` と `user-only preview` を混同していない。
4. Firefox credentialをassistant / repo / artifactへ搬送していない。

## Failure handling

- public取得失敗 → 必要ならX native / Firefox-authへ拡張。
- assistant-side media transportが不要または不適切 → user-only preview。
- user-onlyで良い候補が見つかった → `AIへ渡す` で必要なものだけ昇格。
- protected/deletedでユーザー自身にもアクセス権がない → 迂回しない。
