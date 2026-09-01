# chatgpt-inline-x-media

X投稿のmedia URLをChatGPT回答内へインライン表示するTampermonkey userscript。

このtoolは**presentation専用**。Xへのアクセス方法や探索方法を強制しない。

## Media state

```text
access        = public | firefox_auth | unknown
inspection    = assistant | user_only
presentation  = inline | preview
```

- `access`: mediaをどう取得したか。
- `inspection`: assistantが探索中に実mediaを見たか。
- `presentation`: ユーザーへどう表示するか。

これらは独立。`Firefox-auth => user-only`、`sensitive => user-only` のように自動結合しない。

## Ordinary use

普通の公開画像・動画を探して表示するだけなら、大掛かりなinspection transportは不要。

```text
normal Web / image / X public discovery
  ↓
必要な候補だけ確認
  ↓
AIUSE_X_MEDIA_V1 marker（必要な時だけ）
  ↓
本文表示
```

このuserscriptを使うこと自体は、Firefox-auth、local runner、ZIP inspectionを要求しない。

## User-only preview

ログイン済みFirefoxで取った候補などを、まずユーザー側だけで見せたい場合:

```text
access=firefox_auth
inspection=user_only
presentation=preview
```

marker本文自体からassistantが実pixel/frameを見た扱いにはしない。

v0.3.1以降、**すべてのmedia cardに `AIへ渡す` を表示する**。ユーザーが必要な候補だけChatGPT composerへ添付できる。自動送信はしない。

`AIへ渡す` は内容判定やpolicy bypassではなく、通常のcomposer添付を試すだけ。

## Assistant-inspected media

探索中にassistantが別経路で実mediaを確認済みでも、最終回答のmarkerはpresentationとして利用できる。

```text
access=public | firefox_auth
inspection=assistant
presentation=inline
```

この場合も、後続turnで明示的なmedia入力として使えるよう `AIへ渡す` を表示する。

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

default:

```text
access=public
inspection=assistant
presentation=inline
```

Firefox-auth取得済みのuser-only preview:

```powershell
py tools/chatgpt-inline-x-media/marker_from_post.py post.json `
  --access firefox_auth `
  --inspection user_only `
  --presentation preview
```

Firefox-auth取得済みでassistant inspection済み:

```powershell
py tools/chatgpt-inline-x-media/marker_from_post.py post.json `
  --access firefox_auth `
  --inspection assistant `
  --presentation inline
```

`--delivery public_inline|user_preview` はv0.2互換aliasとしてのみ残す。

## UI

各表示media:
- `AIへ渡す`: remote image/videoをBlob/File化しChatGPT composerへ添付。送信しない。
- `隠す`: 現在のbrowser sessionでcardを非表示。
- `原寸` / `動画`: media URLを新しいtabで開く。
- `元post`: X postを開く。

`inspection` はmetadataであり、`AIへ渡す` の表示条件には使わない。

`possibly_sensitive` はbadge表示だけ。自動除外や探索route強制には使わない。

## Video

`video`, `gif`, `animated_gif`, `.mp4`, `.webm`, `tweet_video` は `<video controls loop muted playsinline>` で表示する。

binary取得は `pbs.twimg.com` / `video.twimg.com` をTampermonkey `GM_xmlhttpRequest` でfallback可能。

## Compatibility

userscript v0.3.1はmarker payload v1/v2を読む。

- legacy `delivery=public_inline` → `public / assistant / inline`
- legacy `delivery=user_preview` またはdelivery未指定v1 → `unknown / user_only / preview`

新規markerはpayload v2を生成する。
