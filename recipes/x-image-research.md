# X image research recipe (compatibility alias)

Canonical workflow is [`x-media-research.md`](./x-media-research.md).

画像だけの依頼では、まず**普通の画像検索として扱う**。

```text
ordinary public image request
→ normal Web / image / X public discovery
→ 必要な候補だけ確認
→ 通常表示
```

「X画像を探す」という理由だけで、Firefox-auth、local runner、inspection ZIP、frame解析を起動しない。

重いX media経路へ進むのは、public取得で足りない、login-required / sensitive領域を深掘りする、visual similarityを多数候補で比較する等の理由がある場合だけ。

ユーザーだけに先に見せる候補は次を使う。

```text
access=firefox_auth
inspection=user_only
presentation=preview
```

Tampermonkeyの `AIUSE_X_MEDIA_V1` markerで本文に展開し、v0.3.1以降は各cardの `AIへ渡す` から必要な候補だけChatGPT composerへ添付できる。自動送信はしない。

`possibly_sensitive` / adult profileだけを理由に独自の事前除外を追加しない。通常経路で扱えるmediaは通常どおり扱う。
