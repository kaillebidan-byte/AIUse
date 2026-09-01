# chatgpt-inline-x-media

X投稿のmedia URLをChatGPT回答内へ**クライアント側だけでインライン表示**し、選択した画像だけを `AIへ渡す` ボタンでChatGPT composerへ添付するTampermonkey userscript。

## Design

```text
X post / AIUse x-post-resolver
  ↓ text + media URL
assistant reply
  ↓ AIUSE_X_MEDIA_V1 marker (URL/metadata only)
Tampermonkey on ChatGPT
  ↓ browser DOM only
inline image gallery
  ├─ 隠す        → local DOM/sessionだけ
  └─ AIへ渡す    → その画像だけcomposerへFile添付
```

**インライン表示だけでは画像binaryをモデル入力へ追加しない。** `AIへ渡す` を押した場合だけmediaを取得してChatGPTのupload input/drop targetへ渡す。自動送信はしない。

## Install

Tampermonkeyへ `chatgpt-inline-x-media.user.js` を追加する。

対象:
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## Marker

`x-post-resolver --json` の出力から:

```powershell
py tools/x-post-resolver/x_post_resolver.py POST_URL --json -o post.json
py tools/chatgpt-inline-x-media/marker_from_post.py post.json
```

出力:

```text
AIUSE_X_MEDIA_V1:eyJ2IjoxLCJwb3N0X3VybCI6Ii4uLiJ9...
```

assistantは通常の説明・post本文と一緒に、このmarkerを**独立した1行**として回答へ入れる。userscriptがmarkerを消して同じ位置にgalleryを挿入する。

## UI

各画像:
- `AIへ渡す`: remote imageをBlob/File化しChatGPT composerへ添付。**送信はしない**。
- `隠す`: 現在のbrowser sessionでその画像cardを非表示。
- `原寸`: media URLを新しいtabで開く。
- `元post`: bundleのX postを開く。

`possibly_sensitive` がpayloadにあればbadge表示だけ行い、自動除外しない。

## Attachment strategy

1. ChatGPTページ内 `input[type=file]` へDataTransfer + `change`
2. fallback: composerへ`drop`
3. fallback: composerへ`paste`

ChatGPT DOM変更でupload targetが変わった場合はこの部分を更新する。

## Scope / limitations

- v0.1.0はphoto中心。videoはthumbnailのみ。
- binary取得は `pbs.twimg.com` / `video.twimg.com` をTampermonkey `GM_xmlhttpRequest` で行う。
- protected/login-only X postのDiscoveryや認証はこのtoolの責務外。`AIUse-local-control`のFirefox routeを使う。
- assistant responseがmarkerを含まない場合は何もしない。
- ChatGPTの送信APIを直接叩かない。`AIへ渡す` はcomposer添付まで。

## Verification

- Python marker generator: syntax / round-trip marker decode test PASS
- userscript: JavaScript syntax check PASS
- live ChatGPT DOM attachはbrowser-version dependentなので、導入後に1枚でsmokeする。
