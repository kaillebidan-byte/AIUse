# X image research recipe

## Trigger
「Xから画像探して」「最近の投稿から参考画像を本文に載せて」「このXの画像を見て」など。

## Goal
検索結果のリンクだけ返さず、**元postを特定し、post本文と添付mediaを確認した状態**まで進める。

## Procedure
1. web search / image searchで候補postを探す。必要なら作者名・作品名・時期を分けて検索する。
2. repostまとめより元postを優先する。
3. post URLを取得したら通常webで本文/mediaが十分見えるか確認する。
4. 欠ける場合は `tools/x-post-resolver/` を使い、本文・作者・日時・media URLを正規化する。
5. 画像解析が必要で直接media URLしかない場合は `tools/web-media-fetcher/` で保存して解析入力へ回す。
6. 「本文に掲載」が依頼に含まれる場合、検索しただけで完了扱いにしない。利用可能な画像UI/添付表示まで行う。
7. 最近の投稿指定では投稿日を確認する。

## Completion
- 元postまたは元作者を特定。
- 依頼に必要なpost本文と画像を実際に確認。
- 「画像を載せる」要求では画像提示まで実施、またはUI/取得制約を具体的に説明。

## Failure handling
protected/deleted/login-only投稿は無理に迂回しない。別の公開post・作者gallery・公式掲載を探す。
