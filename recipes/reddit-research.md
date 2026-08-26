# Reddit research recipe

## Trigger
「Redditで調べて」「redditの評判」「ユーザーの反応を探して」など。

## Goal
検索結果数件を眺めて終わらず、依頼テーマに関する**投稿とコメントの実質的な反応**を確認して答える。

## Procedure
1. web searchで対象語、別表記、関連subredditを検索する。
2. 日付指定がある場合は投稿日時とイベント日時を分けて確認する。
3. 有力threadを複数選ぶ。1件目で結論を固定しない。
4. thread URLを直接読めるなら読む。本文/コメント取得が弱い場合は `tools/reddit-thread-reader/` を使う。
5. OPだけでなく、上位・反対・補足commentを確認する。
6. 同じ主張の転載や同一source由来を重複票として数えない。
7. 回答では「多数派らしい温度」「少数だが具体的な反例」「確認できた事実」を分ける。
8. Reddit上の体験談を事実認定の唯一の根拠にしない。

## Completion
- 少なくとも複数threadを確認した、または該当threadが1件しかないと確認した。
- 主要threadではcommentまで確認した。
- 新旧が混在するテーマでは現在の仕様・状況を別sourceでも確認した。

## Failure handling
未認証`.json`前提にしない。403等なら公開HTML、web search結果、通常web取得へ切り替える。access control回避はしない。
