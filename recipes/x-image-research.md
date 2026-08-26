# X image research recipe

## Trigger
次の依頼では、検索や回答を始める前にこのrecipeを読む。

- 「Xから画像探して」
- 「Xの画像を本文に載せて / 貼って / 見せて」
- 「最近の公式絵を持ってきて」など、X投稿画像の提示が目的に含まれる依頼
- 「このXの画像を見て / 解析して」

## Goal
検索結果や画像URLだけ返さず、**元postを特定し、post本文と添付mediaを確認し、画像提示要求がある場合はChatGPT本文内で実画像が見える状態まで到達する**。

## Hard completion rule
ユーザーが「本文に画像を載せる / 貼る / 見せる」ことを要求した場合、以下は未完了。

- X post URLだけを返す
- `pbs.twimg.com` 等の直接画像URLだけを返す
- `![...](https://pbs.twimg.com/...)` のような外部URL Markdown画像を返す
- 「画像URLを取得できた」と報告するだけ

**ChatGPT UI上で実画像が描画されることを完成条件とする。**

2026-08-26時点のknown-goodな最終形は、画像を会話側の `/mnt/data/...` に実ファイルとして搬送し、`![label](sandbox:/mnt/data/file.jpg)` で表示する方法。

## Normal procedure
1. web search / image searchで候補postを探す。必要なら作者名・作品名・時期を分けて検索する。
2. repostまとめより元post、公式post、元作者を優先する。
3. 最近の投稿指定では投稿日を確認する。
4. post URLを得たら、通常webで本文/mediaが十分見えるか確認する。
5. 欠ける場合は `tools/x-post-resolver/` を使い、本文・作者・日時・media URLを正規化する。
6. 画像解析・本文掲載が必要なら、直接media URLを**ローカル画像ファイルへ搬送**する。通常実行環境から取得できるなら `tools/web-media-fetcher/` を使う。
7. 最終回答で実画像が描画されたことまで確認する。

## Known-good ChatGPT transport path
通常の実行環境から外向きHTTP/DNSが使えず、Xの直接media URLをローカル保存できない場合の実証済み経路。

```text
X post URL
  ↓
x-post-resolver
  ↓
FxTwitterからpost JSON + pbs.twimg.com原寸URL
  ↓
GitHub Actions runnerで画像download
  ↓
actions/upload-artifact
  ↓
GitHub connectorでworkflow artifact取得
  ↓
download_workflow_artifact
  ↓
/mnt/data にZIPとして到着
  ↓
Pythonで展開
  ↓
/mnt/data/*.jpg
  ↓
![...](sandbox:/mnt/data/*.jpg)
  ↓
ChatGPT本文内に実画像表示
```

2026-08-26に `azurlane_staff/status/2086709129742028826` で実証。原寸photo 2件を本文表示まで成功。

### GitHub connector上の注意
- 現在の `fetch_commit_workflow_runs` はPR起点runの確認に向く。pushだけではrunが見えない場合がある。
- connectorからrun/log/artifactまで追う必要がある場合は、temporary branch + draft PRでworkflowを起動する経路が実証済み。
- workflow側は画像をdownloadしただけで終わらず、`actions/upload-artifact` まで行う。artifact化しないと会話側へbinaryを搬送できない。
- テスト用PRは結果確認後にcloseする。

## Failure ledger — do not rediscover from zero
2026-08-26に確認した失敗・不十分経路。

1. **通常のX web閲覧だけ**
   - 検索結果からpost特定や本文断片は取れることがある。
   - X本体取得が403等で不安定。
   - mediaの実ファイル搬送まで保証しない。

2. **外部画像URLをMarkdownへ直書き**
   - `![...](https://pbs.twimg.com/...)` はChatGPT本文内の実画像表示にならない場合がある。
   - 「本文掲載」の完成条件には数えない。

3. **ChatGPT側Pythonから直接FxTwitter/Xへ通信**
   - 実行環境によって外向きDNS/networkが塞がれる。
   - 失敗したらスクリプト不良と決めつけず、GitHub Actions等のnetwork-enabled runnerへ移す。

4. **media URL取得だけで終了**
   - resolverとしては成功でも、画像提示taskとしては失敗。
   - `x-post-resolver` の成功判定とユーザー依頼の成功判定を分ける。

## Completion
- 元postまたは元作者を特定。
- 依頼に必要なpost本文と画像を実際に確認。
- 「画像を載せる」要求では、**最終回答本文で実画像が描画されている**。
- 取得経路に制約があり達成不能なら、どの段階で止まったかを具体的に示す。URL取得だけを成功扱いしない。

## Failure handling
protected / deleted / login-only投稿は無理に迂回しない。別の公開post・作者gallery・公式掲載を探す。
