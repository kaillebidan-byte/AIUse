# Recipes

定型依頼に対して「どのtoolを、どの順で、どこまで実行するか」を固定するassistant向け手順。

toolが**取得・変換の実装**、recipeが**作業完了条件と失敗済み経路**を担当する。

## Index

| Recipe | Use for | Do not stop at |
| --- | --- | --- |
| [reddit-research.md](reddit-research.md) | Redditを調べる、評判・体験談・雑談を拾う | 検索結果タイトルだけ |
| [x-image-research.md](x-image-research.md) | Xで画像を探し、投稿・画像を本文提示する | post URL / media URL / 外部URL Markdownだけ |
| [video-transcription.md](video-transcription.md) | 動画の発話を文字起こし・要約・timestamp化する | 動画URL取得だけ / download失敗をSTT失敗扱い |
| [video-analysis.md](video-analysis.md) | 動画の映像・キャラ動作・UI変化を実frameで見る | frame path / extraction成功だけ |
| [futaba-archive-research.md](futaba-archive-research.md) | ふたばの消滅済み/URL不明スレを過去ログから探す | 一般Web検索0件 / 候補URL発見だけ |
| [source-deep-dive.md](source-deep-dive.md) | ふたば/X/Reddit等を横断して過去事例を深掘りする | 最初に見つけた1 sourceだけ |

未来のassistantは、依頼がこのパターンに一致する場合、**回答を作り始める前に該当recipeを読む**。各recipeの `Completion` と `Failure ledger` が、通常の「取得できた」というtool成功より優先される。

特に「本文に載せて」「貼って」「見せて」のようにUI表示そのものが要求される場合、URL取得は中間成果でしかない。最終回答上で実際に描画された状態を完成条件とする。

ふたば過去ログでは同様に、一般検索engineの0件やsnippetだけでは未完了。過去ログ検索で候補threadを発見し、取得可能なarchive本文まで確認する。

動画分析では同様に、frame抽出ツールがpathを返しただけでは未完了。必要なframeをChatGPT側へ搬送し、assistant visionで実際に内容を確認する。
