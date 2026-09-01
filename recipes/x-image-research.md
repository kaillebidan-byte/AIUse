# X image research recipe

## Trigger
次の依頼では、検索や回答を始める前にこのrecipeを読む。

- 「Xから画像探して」
- 「Xの画像を本文に載せて / 貼って / 見せて」
- 「最近の公式絵を持ってきて」など、X投稿画像の提示が目的に含まれる依頼
- 「このXの画像を見て / 解析して」

## Goal
検索結果や画像URLだけ返さず、**元postを特定し、post本文と添付mediaを確認し、画像提示要求がある場合はChatGPT UI内で実画像が見える状態まで到達する**。

画像提示には2つのmodeを区別する。

1. **user preview**: ユーザーが画像を見るだけ。`tools/chatgpt-inline-x-media/` のclient-side inline表示を第一経路にする。画像pixelはmodel inputへ入れない。
2. **model inspection**: assistantにも画像を見せて解析させる。inline galleryの `AIへ渡す` で選択画像をcomposerへ添付するか、従来のbinary transportを使う。

## Hard completion rule
ユーザーが「本文に画像を載せる / 貼る / 見せる」ことを要求した場合、以下は未完了。

- X post URLだけを返す
- `pbs.twimg.com` 等の直接画像URLだけを返す
- `![...](https://pbs.twimg.com/...)` のような外部URL Markdown画像を返す
- 「画像URLを取得できた」と報告するだけ

**ChatGPT UI上で実画像が描画されることを完成条件とする。**

## Preferred path — client-side inline preview
Tampermonkeyに `tools/chatgpt-inline-x-media/chatgpt-inline-x-media.user.js` が導入済みなら、通常の「見せて」依頼ではこの経路を優先する。

```text
X post URL
  ↓
x-post-resolver / AIUse-local-control Firefox route
  ↓
post text + media URL
  ↓
marker_from_post.py
  ↓
AIUSE_X_MEDIA_V1:<base64url-json>
  ↓ assistant replyへ独立1行で入れる
Tampermonkey
  ↓
ChatGPT本文内へclient-side galleryを描画
  ├─ 隠す
  └─ AIへ渡す → 選択画像だけcomposerへ添付（自動送信しない）
```

このmodeではassistant replyに入るのはURL/metadata markerだけで、画像binary自体はuserscriptがbrowser側で取得する。

### Marker generation

```powershell
py tools/x-post-resolver/x_post_resolver.py POST_URL --json -o post.json
py tools/chatgpt-inline-x-media/marker_from_post.py post.json
```

assistantはpost本文等の通常回答と一緒にmarkerを独立行で出す。userscriptがmarkerを消してgalleryへ置換する。

## Normal procedure
1. web search / image searchで候補postを探す。必要なら作者名・作品名・時期を分けて検索する。
2. repostまとめより元post、公式post、元作者を優先する。
3. 最近の投稿指定では投稿日を確認する。
4. post URLを得たら、通常webで本文/mediaが十分見えるか確認する。
5. 欠ける場合は `tools/x-post-resolver/`、protected/login-required Discoveryならprivate `AIUse-local-control` のFirefox/X routeを使い、本文・作者・日時・media URLを正規化する。
6. user previewならinline marker routeを使う。
7. assistant自身の画像解析が必要なら `AIへ渡す` でユーザーが選択した画像を次turnのimage inputへ昇格させる。userscriptが無い場合や自動解析が必須なら下記binary fallbackを使う。
8. 最終回答で要求された表示・解析まで到達したか確認する。

## Binary fallback — sandbox transport
userscript未導入、media URLがclient側で描画できない、またはassistant側で即時vision解析が必要な場合は従来経路を使う。

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

2026-08-26に `azurlane_staff/status/2086709129742028826` で原寸photo 2件を本文表示まで実証済み。最短手順は `tools/x-post-resolver/bridge-usage.md`。

## Sensitive media handling
- Xの `possibly_sensitive` はmetadataとして保持し、inline previewではbadge表示に留める。
- 自動除外条件にはしない。
- `隠す` はclient-side表示だけを消す。
- model inputへ入れるかは `AIへ渡す` の明示操作で決める。

## Failure ledger — do not rediscover from zero
1. 通常のX web閲覧だけではpost/media取得が不安定な場合がある。
2. 外部画像URLのMarkdown直書きはChatGPT UIで描画されない場合がある。
3. ChatGPT側Pythonから直接FxTwitter/Xへ通信できない環境がある。
4. media URL取得だけで画像提示taskを成功扱いしない。
5. Actions workflowを対象postごとに書き換えない。従来fallbackでは`request-url.txt`差し替えbridgeを使う。
6. client-side gallery表示とmodel image inputを混同しない。`AIへ渡す` を押すまではpreviewのみ。

## Completion
- 元postまたは元作者を特定。
- 依頼に必要なpost本文/mediaを確認。
- 「画像を載せる」要求ではChatGPT UI内で実画像が描画されている。
- assistant解析要求では、必要画像が実際にmodel inputへ渡された後に解析する。
- 取得経路に制約があり達成不能なら、どの段階で止まったかを具体的に示す。

## Failure handling
protected / deleted / login-only投稿は、既に認証済みのprivate local-control routeで合法的に閲覧できる場合はそのrouteを使う。アクセス権のない内容を迂回しない。
