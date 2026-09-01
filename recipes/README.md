# Recipes

定型依頼に対して「どのtoolを、どの順で、どこまで実行するか」を固定するassistant向け手順。

toolが**取得・変換の実装**、recipeが**routing・作業完了条件・失敗済み経路**を担当する。

未来のassistantはまずroot `README.md` のTask routingを確認する。通常Webで足りる場合は専用routeを無理に使わない。

## Normal recipes

日常の調査・候補探索・保存で使う。

| Recipe | Use for | Do not stop at |
| --- | --- | --- |
| [research-routing.md](research-routing.md) | 通常WebからX/Reddit/GitHub/real-browser等へ枝を出す判断 | 最初の検索engineだけ |
| [twitch-archive-discovery.md](twitch-archive-discovery.md) | Twitch archive候補発見→shortlist→PC保存 | VOD URL発見だけ |
| [youtube-video-discovery.md](youtube-video-discovery.md) | YouTube native search→shortlist→PC保存 | search result URLだけ |
| [reddit-research.md](reddit-research.md) | Redditの評判・体験談・雑談を拾う | 検索結果タイトルだけ |
| [x-media-research.md](x-media-research.md) | Xで画像/動画/GIFを探し、assistant visual inspection後に本文提示する | metadataだけ / post URLだけ |
| [x-image-research.md](x-image-research.md) | 旧X画像recipe名からcanonical X media recipeへ誘導 | 旧user-preview前提へ戻ること |
| [futaba-archive-research.md](futaba-archive-research.md) | ふたばの消滅済み/URL不明スレを過去ログから探す | 一般Web検索0件 / 候補URLだけ |
| [source-deep-dive.md](source-deep-dive.md) | ふたば/X/Reddit/GitHub等を横断して過去事例を深掘り | 最初に見つけた1 sourceだけ |

## Heavy media recipes — explicit opt-in only

次は通常の「動画を探す」「候補出す」「保存する」では呼ばない。ユーザーが内容解析を明示した場合だけ使う。

| Recipe | Explicit request | Completion |
| --- | --- | --- |
| [video-transcription.md](video-transcription.md) | 文字起こし、発話要約、timestamp化 | 実音声→transcript/timestamps |
| [video-analysis.md](video-analysis.md) | 映像、キャラ動作、UI変化、特定場面を見る | frame抽出後にassistant visionで実確認 |

Whisper/STT、全文transcript、frame extraction、media-mcp等は計算・転送コストが重いため、Discovery/Downloadの標準後段にはしない。

## Common completion rule

各recipeの `Completion` とfailure noteが、単なるtool成功より優先される。

- 「検索した」だけで終わらない。
- 「URLを取れた」だけで終わらない。
- ユーザーが候補を求めたら意味的に絞る。
- PC保存を求めたらlocal fileの存在まで確認する。
- UI表示そのものが要求された場合は実際に表示されるところまで進める。

X mediaのvisual-reference探索では、最終候補をmetadataだけで決めず、必要な実画像/動画frameをassistantが確認する。Firefox-authは取得方法であり、assistant inspectionの禁止を意味しない。
