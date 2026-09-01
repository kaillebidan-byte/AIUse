# X image research recipe (compatibility alias)

Canonical workflow is [`x-media-research.md`](./x-media-research.md).

画像だけの依頼でも、X取得・assistant inspection・ユーザー表示の境界は同じなので、以後は `x-media-research.md` を読む。

特に以下の旧ルールは廃止する。

- Firefox-auth mediaを自動的にuser-only previewへ送る
- `possibly_sensitive` / adult文脈だけを理由にassistant inspectionを止める
- 「本文に表示できた」ことを「assistantも実pixelを見た」と扱う

現在のhard rule:

```text
access        = public | firefox_auth
inspection    = assistant | user_only
presentation  = none | inline | preview
```

3軸を独立して扱う。
