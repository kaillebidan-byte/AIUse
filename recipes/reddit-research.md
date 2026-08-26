# Reddit research recipe

## Trigger
「Redditで調べて」「redditの評判」「ユーザーの反応を探して」など。

## Goal
検索結果数件を眺めて終わらず、依頼テーマに関する**投稿とコメントの実質的な反応**を確認して答える。

## Procedure
1. ChatGPTではまず通常のweb searchで対象語、別表記、関連subredditを検索する。
2. 日付指定がある場合は投稿日時とイベント日時を分けて確認する。
3. 有力threadを複数選ぶ。1件目で結論を固定しない。
4. **ChatGPTのweb経路で元Reddit threadを直接openできる場合は、それを第一経路にする。** OPだけでなくcomment本文まで開く。
5. `tools/reddit-thread-reader/` は、実行環境からReddit public HTML/RSSへ到達できる場合の補助経路。検索snippetだけでは足りず、機械可読化が必要なときに使う。
6. OPだけでなく、上位・反対・補足commentを確認する。
7. 同じ主張の転載や同一source由来を重複票として数えない。
8. 回答では「多数派らしい温度」「少数だが具体的な反例」「確認できた事実」を分ける。
9. Reddit上の体験談を事実認定の唯一の根拠にしない。

## ChatGPT transport rule — 2026-08-26
`reddit-thread-reader` をGitHub Actionsから実ネットワーク試験したところ、Redditは次をどちらもHTTP 403にした。

- 通常public HTML
- per-thread `.rss`

したがって **ChatGPTでReddit調査する際、GitHub Actionsへreaderを投げる経路をデフォルトにしない。** 同じ403をHTML→RSSと何度も再探索しない。

一方、ChatGPTの通常web取得では同一threadのOPとcommentを全文寄りで取得できることを同日に確認済み。ChatGPTセッションではこちらを優先する。

ローカルPCや別ネットワークではHTML/RSSが通る可能性があるためreader自体は残す。RSS方式の既存実装として `ninjackster/reddit-rss-mcp` があり、comment feedはflat・scoreなし・約25件上限という制約がある。

## Completion
- 少なくとも複数threadを確認した、または該当threadが1件しかないと確認した。
- 主要threadではcommentまで確認した。
- 新旧が混在するテーマでは現在の仕様・状況を別sourceでも確認した。
- **検索結果snippetだけで回答を完成させない。** 元threadをweb openできた場合はcommentまで読む。

## Failure handling
- 未認証`.json`前提にしない。
- GitHub Actions等からHTML/RSSが403ならそこでreader経路を打ち切り、ChatGPT web取得へ切り替える。
- access control回避はしない。
