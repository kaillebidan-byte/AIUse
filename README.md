# AIUse

AI / assistant workflows用の小さな補助ツールと定型作業recipeの置き場。

このリポジトリは、特定の作業で必要になった取得・変換・検査などを、後のセッションでも再利用できる形で保存するために使う。

## Future assistant entrypoint

後からこのリポジトリを使う場合は、まずこのREADMEの **Task routing / Tool index / Recipe index** を確認する。

- URLやmediaを機械的に取得・変換するなら `tools/<name>/README.md`
- 「Reddit調査」「X画像調査」「動画文字起こし/映像分析」のような定型依頼なら `recipes/<name>.md`
- 新しい共通downstream出力を作る場合は [`schemas/result-envelope-v1.md`](schemas/result-envelope-v1.md) を確認する。
- 必要がない限りリポジトリ全体を走査しない。

## Task routing — check before answering

次の依頼パターンに当たる場合、通常回答を始める前に対応recipeを読む。検索結果や中間URLだけで早上がりしない。

| User intent / trigger | Read first | Critical completion |
| --- | --- | --- |
| 外部調査で通常Webだけで足りるか、X/Reddit/GitHub/実ブラウザ等へ枝を広げる判断 | [research-routing](recipes/research-routing.md) | 結論を変え得るsourceへだけ枝を出し、重要候補は元本文まで確認 |
| 「Twitchアーカイブ探して」「〇〇の雑談系VOD候補」「候補からDLしておいて」 | [twitch-archive-discovery](recipes/twitch-archive-discovery.md) | channel解決→archive候補取得→assistant再ランキング→選択VODをlocal PCへ保存 |
| 「Reddit調べて」「Redditの反応・評判」 | [reddit-research](recipes/reddit-research.md) | relevant threadだけでなく必要なcommentまで確認。ChatGPTではweb open優先 |
| 「Xから画像探して」「Xの画像を本文に載せて/貼って/見せて」「最近の公式絵を持ってきて」 | [x-image-research](recipes/x-image-research.md) | **実画像が最終回答本文で描画されるまで**。post URLやmedia URLだけでは未完了 |
| 「動画を文字起こし/要約」「動画内の発話を確認」 | [video-transcription](recipes/video-transcription.md) | download経路とSTTを分離し、必要なら実音声→transcript/timestampsまで取得 |
| 「動画を見て」「映像・キャラ動作・画面変化を確認」 | [video-analysis](recipes/video-analysis.md) | 必要timestampを実frame化し、**assistant visionで実画像を確認するまで** |
| 「ふたばの過去スレも探して」「img/mayの過去ログを掘って」「前にこの話してなかった？」 | [futaba-archive-research](recipes/futaba-archive-research.md) | 一般検索0件で不存在判定せず、過去ログ検索→候補発見→archive本文確認まで |
| ふたば/X/Reddit/GitHub等をまたいだ実例調査 | [source-deep-dive](recipes/source-deep-dive.md) | sourceを横断して結論を変える材料まで確認。ふたば過去ログが関係する場合はarchive recipeも併用 |

特にX画像提示では、外部 `pbs.twimg.com` URLをMarkdown画像にしただけではChatGPT UI上で表示されないことがある。`recipes/x-image-research.md` のknown-good transport pathとfailure ledgerを参照し、同じ失敗探索を繰り返さない。

Twitch archive探索では、ユーザーへVOD URLを探させない。channel/handleを解決し、private local-controlが使える場合は `twitch_archive_search` でVOD候補を列挙し、曖昧な「雑談系」等の意味判断はassistant側で再ランキングする。DLは検索backendと分離し、選択されたVODだけ `TwitchDownloaderCLI` でユーザーPCへ直保存する。詳細は `recipes/twitch-archive-discovery.md`。

ふたば過去ログ探索では、一般検索engineにindexされていないスレがある。Google/Bing等で0件でも不存在とは扱わず、`recipes/futaba-archive-research.md` に従ってFutafuta等の過去ログ検索から候補を発見し、`kako.futakuro.com` 等で取得できるarchive本文まで確認する。現行スレ取得用の `tools/futaba-thread-reader/` と、消滅済みスレの発見は別問題として扱う。

Reddit調査では、2026-08-26時点でGitHub Actions runnerからpublic HTML / per-thread RSSの両方が403になった実測がある。ChatGPTのweb経路で元threadをopenできる場合はそちらを第一経路にし、Actions経由readerで同じ403を再探索しない。詳細は `recipes/reddit-research.md`。

動画文字起こしでは、GitHub-hosted runnerからYouTubeをyt-dlp取得するとbot確認で止まる実測がある一方、local MP4 → FFmpeg → faster-whisper → Markdown/JSON/VTTはPASSしている。YouTube取得失敗をWhisper失敗として扱わない。詳細は `recipes/video-transcription.md`。

動画visionでは `woosal1337/media-mcp` のprecision frame extractionを実証済み。2026-08-26時点でnpm registryの `media-mcp@1.2.0` は404になるため、同じnpm導入を繰り返さずsource build経路を使う。詳細は `recipes/video-analysis.md` と `tools/media-mcp-frames-smoke/README.md`。

## Structure

```text
AIUse/
├─ README.md
├─ .gitignore
├─ schemas/
│  └─ result-envelope-v1.md
├─ tools/
│  └─ <tool-name>/
│     ├─ README.md
│     ├─ requirements.txt
│     └─ <entrypoint>
└─ recipes/
   ├─ README.md
   └─ <workflow>.md
```

ツールは用途単位で自己完結させる。日付や会話単位では分けず、同じ目的の改善は同じディレクトリへ積む。

## Tool index

| Tool | Purpose | Entrypoint | Status | Last verified |
| --- | --- | --- | --- | --- |
| [futaba-thread-reader](tools/futaba-thread-reader/README.md) | ふたば☆ちゃんねるの現行スレをLLM向けMarkdown / JSONへ整形 | `futaba_img_reader.py` | usable | 2026-08-26 |
| [x-post-resolver](tools/x-post-resolver/README.md) | X/Twitter post本文・作者・添付mediaを正規化 | `x_post_resolver.py` | usable | 2026-08-26 |
| [reddit-thread-reader](tools/reddit-thread-reader/README.md) | 公開Reddit threadのOP/commentをHTMLから正規化 | `reddit_thread_reader.py` | environment-sensitive; ChatGPT web preferred | 2026-08-26 |
| [web-media-fetcher](tools/web-media-fetcher/README.md) | 直接media URLをローカルファイルへ保存 | `web_media_fetcher.py` | usable | 2026-08-26 |
| [media-inspector](tools/media-inspector/README.md) | 既存helperを束ね、media metadata / transcript /代表frameをresult-envelope v1へまとめる | `media_inspector.py` | metadata smoke PASS; combined E2E pending | 2026-08-26 |

検証harness:
- `tools/video-transcription-smoke/` — 既存 `kavenio-youtube-transcribe` のSTT検証。独自wrapperではない。
- `tools/media-mcp-frames-smoke/` — 既存 `woosal1337/media-mcp` のprecision frame extraction検証。独自extractorではない。

## Recipe index

| Recipe | Purpose |
| --- | --- |
| [research-routing](recipes/research-routing.md) | 通常Webからsource固有Discovery・実ブラウザfallbackへ分岐する検索router |
| [twitch-archive-discovery](recipes/twitch-archive-discovery.md) | Twitch channelのVOD候補発見→意味的shortlist→TwitchDownloaderCLI直DLへ接続 |
| [reddit-research](recipes/reddit-research.md) | Redditの評判・体験談・commentまで確認する調査 |
| [x-image-research](recipes/x-image-research.md) | Xの元post特定→本文/media確認→**ChatGPT本文内の実画像表示**まで進める |
| [video-transcription](recipes/video-transcription.md) | 動画取得経路とSTTを分離し、発話をtranscript/timestampsへ変換する |
| [video-analysis](recipes/video-analysis.md) | 必要timestampだけframe抽出し、映像をassistant visionで実確認する |
| [futaba-archive-research](recipes/futaba-archive-research.md) | ふたばの消滅済み/URL不明スレを過去ログ検索で発見し、archive本文まで確認する |
| [source-deep-dive](recipes/source-deep-dive.md) | ふたば/X/Reddit/GitHub等を横断して実例を深掘り |

## Rules for future tools

新しい補助ツールを追加するときは、最低限そのディレクトリのREADMEへ次を残す。

- **Purpose**: 何を解決するか
- **When to use**: どの状況で呼ぶか
- **Inputs / Outputs**: 受け取るものと返すもの
- **Usage**: 最短の実行例
- **Dependencies**: 必要な外部パッケージや環境
- **Limitations**: 既知の失敗条件やアクセス境界
- **Verification**: 最後に確認した日と範囲

そのほかの方針:
- ディレクトリ名は目的が分かる `kebab-case`。
- CLIは可能な限り安定させ、出力はUTF-8を基本にする。
- 一時出力、キャッシュ、認証情報、Cookie、秘密鍵はコミットしない。
- 個人情報や会話ログそのものではなく、再利用可能な道具だけを置く。
- 既存ツールで足りる場合は新規作成せず、既存ツールを更新する。
- 新しい取得方式を作る前に既存実装・現行仕様を確認し、薄いwrapperを優先する。
- 新しいcross-source/downstream toolで共通JSONが必要なら `result-envelope v1` を使う。既存readerは、そのreaderを別件で触るまでschema移行だけを目的に改修しない。

## Rules for recipes

recipeはコードではなく、未来のassistantが定型依頼を最後まで完了するためのチェックリスト。

- tool名を固定で参照しすぎず、通常web取得で足りる場合はそちらを優先する。
- 「検索した」「URLを取れた」で止めず、依頼の成果物（本文確認、comment精読、画像提示、実frame確認など）をCompletionに書く。
- UI上の見え方が依頼の一部なら、**レンダリングされたか**まで完成条件に含める。
- source仕様が変わったらtoolだけでなく該当recipeも見直す。
