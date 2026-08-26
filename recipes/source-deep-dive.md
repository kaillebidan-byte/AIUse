# Source deep-dive recipe

## Trigger
「過去スレやXも見てまとめて」「似た事例を掘って」「この遊び方をしている人を探して」など、複数sourceを跨ぐ探索。

## Goal
一つの検索engineの上位結果だけで済ませず、sourceごとの得意情報を使って**実例・時系列・再現条件**をまとめる。

## Procedure
1. 依頼を「対象」「期間」「探す実例」「知りたい条件」に分解する。
2. 現在ページ/起点URLがある場合、最初に本文を読む。
   - ふたば: `tools/futaba-thread-reader/`
   - X: `tools/x-post-resolver/`
   - Reddit: `tools/reddit-thread-reader/`
3. 起点で得た固有語、作者名、ツール名、引用文を検索keyに展開する。
4. source別に探索:
   - X: 最新事例、画像、作者の連続投稿
   - Reddit: 体験談、失敗例、長文comment
   - ふたば: 国内の雑談、局所的ノウハウ
   - GitHub/公式: 実装・仕様の裏取り
5. 同一事例の転載をまとめ、独立事例数を水増ししない。
6. 「できるらしい」と「再現手順が確認できた」を区別する。
7. 回答は依頼の判断を変える情報を優先し、source別羅列で終えない。

## Completion
- 起点sourceを読み切るか、取得不能を確認。
- 少なくとも2種類のsourceを探索（依頼が単一source限定なら除く）。
- 実例と仕様の双方が重要な場合は、community sourceと一次/実装sourceを両方確認。
