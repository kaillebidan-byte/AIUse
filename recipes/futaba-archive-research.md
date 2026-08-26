# Futaba archive research recipe

## Trigger

「ふたばの過去スレも探して」「img/mayで以前この話をしていなかった？」「この話題の過去ログを掘って」など、ふたば☆ちゃんねるの**消滅済みスレやURL不明の過去スレ**を探索する依頼。

## Goal

通常のWeb検索だけで「見つからない」と判定せず、ふたば向け過去ログ検索と既知archiveを使って、対象スレの発見から本文確認まで進める。

## Routing

### 1. 現行スレURLが既知

- まずChatGPTの通常web取得で本文を読む。
- 直接取得が失敗する、またはレス構造の正規化が必要なら `tools/futaba-thread-reader/` を使う。

### 2. 過去スレURL / thread numberが既知

- 対応archive URLを直接開く。
- `kako.futakuro.com` など、実際に本文を取得できるarchiveを優先する。
- 通常検索engineにindexされていなくても、既知URLへ直接到達できるなら「取得可能」と扱う。

### 3. 過去スレURLが不明

- 一般Web検索だけで終了しない。
- Futafutaなど、ふたば過去ログを検索できるサービスを使って候補threadを発見する。
- 板名、期間、固有語、引用文、thread number、関連キャラ/作品名などを検索keyにする。
- 起点スレがある場合は、そこで得た特徴的な語句や引用を検索keyへ展開する。
- 候補を見つけたらarchive本文を実際に開き、依頼に必要なレスまで確認する。

## Search discipline

- Google/Bing等の一般検索で0件でも、ふたば過去ログ不存在の根拠にはしない。
- 検索結果snippetだけで内容を確定せず、可能な限りarchive本文を確認する。
- 同じスレの転載・別archiveを独立事例として数えない。
- 「過去スレが存在したらしい」と「本文を確認できた」を区別する。
- dirtyな雑談、局所的ノウハウ、遊び方、失敗例を探す依頼では、公式情報だけに寄せず実レスを優先する。

## Completion

- URL既知なら、archive本文を取得するか取得不能を確認する。
- URL不明なら、一般検索に加えて少なくとも1つのふたば向け過去ログ検索経路を試す。
- 見つけた候補は本文確認まで進め、検索結果URLの列挙だけで終えない。
- 複数source調査の一部なら `source-deep-dive.md` のcompletionも満たす。

## Known boundary

`tools/futaba-thread-reader/` は現行 `2chan.net` スレのreaderであり、404後の復元機能は持たない。過去ログの**発見**はこのrecipe側で扱い、archive本文が直接読める場合は通常web取得を優先する。
