# chatgpt-inline-x-media

X投稿のmedia URLをChatGPT回答内へインライン表示するTampermonkey userscript。

このtoolは**presentation plane専用**。Xへのアクセス方法や、assistantが探索中に実mediaを検査したかどうかを決めるtoolではない。

## Three independent axes

```text
access        = public | firefox_auth | unknown
inspection    = assistant | user_only
presentation  = inline | preview
```

- `access`: mediaをどう取得したか。Firefox loginを使ったかどうか。
- `inspection`: 回答生成前の探索・比較でassistantが実mediaを見たかどうか。
- `presentation`: 最終回答でどう表示するか。

**Firefox-authだからuser-only、sensitiveだからuser-only、という自動結合はしない。**

## Normal path

通常の公開mediaでもFirefox-auth mediaでも、探索品質のためassistantが実物を見る必要がある場合は先にinspection transportでassistantへ渡す。その後、最終候補だけpresentation markerへする。

```text
X search / Firefox-auth search
  ↓
inspection transport
  ↓
assistantが実画像・動画を比較
  ↓
selected results
  ↓
AIUSE_X_MEDIA_V1 marker
  ↓
Tampermonkey
  ↓
ChatGPT本文内で画像 / video再生
```

`inspection=assistant` のmarkerには `AIへ渡す` を表示しない。すでにassistant inspection済みだから。

## User-only escape hatch

ユーザーが先に自分だけで確認したい場合、またはassistant inspectionへ流さない例外mediaだけ:

```text
inspection=user_only
presentation=preview
```

この場合だけ `AIへ渡す` が表示される。押すと選択mediaをChatGPT composerへFile添付する。自動送信はしない。

## Install

Tampermonkeyへ `chatgpt-inline-x-media.user.js` を追加する。

対象:
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## Marker generation

通常のpublic post:

```powershell
py tools/x-post-resolver/x_post_resolver.py POST_URL --json -o post.json
py tools/chatgpt-inline-x-media/marker_from_post.py post.json
```

defaultは:

```text
access=public
inspection=assistant
presentation=inline
```

Firefox-authで取得済み、かつassistantもinspection済みの結果:

```powershell
py tools/chatgpt-inline-x-media/marker_from_post.py post.json `
  --access firefox_auth `
  --inspection assistant `
  --presentation inline
```

user-only preview:

```powershell
py tools/chatgpt-inline-x-media/marker_from_post.py post.json `
  --access firefox_auth `
  --inspection user_only `
  --presentation preview
```

`--delivery public_inline|user_preview` はv0.2互換aliasとしてのみ残す。

## UI

共通:
- `隠す`: 現在のbrowser sessionでcardを非表示。
- `原寸` / `動画`: media URLを新しいtabで開く。
- `元post`: X postを開く。

`inspection=user_only` のみ:
- `AIへ渡す`: remote image/videoをBlob/File化しChatGPT composerへ添付。送信しない。

`possibly_sensitive` はbadge表示だけ。自動除外やinspection policyには使わない。

## Video

`video`, `gif`, `animated_gif`, `.mp4`, `.webm`, `tweet_video` は `<video controls loop muted playsinline>` で表示する。

binary取得は `pbs.twimg.com` / `video.twimg.com` をTampermonkey `GM_xmlhttpRequest` でfallback可能。

## Compatibility

userscript v0.3.0はmarker payload v1/v2を読む。

- legacy `delivery=public_inline` → `public / assistant / inline`
- legacy `delivery=user_preview` またはdelivery未指定v1 → `unknown / user_only / preview`

新規markerはpayload v2を生成する。
