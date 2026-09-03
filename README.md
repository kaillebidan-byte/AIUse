# AIUse

AI / assistant workflows用の再利用可能な補助ツールとrecipe置き場。

このrepoは、取得・検索・変換・検査などを後のセッションでも再利用できる形で保存する。privateなPC操作や認証情報は `AIUse-local-control` 側へ分離する。

## Future assistant entrypoint

外部調査やmedia探索でAIUseが使えそうなら、まずこのREADMEの **Task routing** を確認する。

原則:

1. 普通のWebで足りるなら普通のWebを使う。
2. source固有Discoveryが結論や候補品質を変え得る時だけ専用routeへ枝を出す。
3. URL取得や候補発見で止めず、ユーザーが欲しい成果物まで進める。
4. 文字起こし・frame解析のような重いmedia処理は通常routeへ混ぜない。明示要求時だけ実行する。
5. private local-controlを使える場合、認証やPC直保存はそちらへ渡す。秘密情報をpublic repoへ置かない。

## Task routing — normal path

| User intent / trigger | Read first | Critical completion |
| --- | --- | --- |
| 外部調査で通常Webだけで足りるか、X/Reddit/GitHub/実ブラウザ等へ枝を広げる判断 | [research-routing](recipes/research-routing.md) | 結論を変え得るsourceへだけ枝を出し、重要候補は元本文まで確認 |
| 「Twitchアーカイブ探して」「〇〇の雑談系VOD候補」「候補からDLして」 | [twitch-archive-discovery](recipes/twitch-archive-discovery.md) | channel解決→archive候補取得→assistant再ランキング→選択VODをlocal PCへ保存 |
| 「ツイキャス配信一覧」「TwitCasting録画探して」「候補からDLして」 | [twitcasting-archive-discovery](recipes/twitcasting-archive-discovery.md) | handle解決→Firefox認証付きarchive候補取得→assistant再ランキング→選択movieをlocal PCへ保存 |
| 「YouTubeで〇〇探して」「長尺/雑談/解説動画候補」「2番DLして」 | [youtube-video-discovery](recipes/youtube-video-discovery.md) | native search→assistant再ランキング→選択動画をFirefox認証付きyt-dlpでlocal PCへ保存 |
| 「Withnyで配信者/ライブ/アーカイブ探して」「開いて録画して」 | [withny-discovery](recipes/withny-discovery.md) | current live/access確認→同一persistent Firefox sessionでopen→選択live/archiveをlocal PCへ保存→ffprobe |
| 「Reddit調べて」「Redditの反応・評判」 | [reddit-research](recipes/reddit-research.md) | relevant threadだけでなく必要なcommentまで確認。ChatGPT web優先 |
| 「Xから画像探して」「Xの画像を本文に貼って/見せて」 | [x-image-research](recipes/x-image-research.md) | 元post/media確認→**最終回答本文で実画像表示**まで |
| 「ふたばの過去スレも探して」「img/may過去ログを掘って」 | [futaba-archive-research](recipes/futaba-archive-research.md) | 一般検索0件で不存在判定せず、過去ログ検索→archive本文確認まで |
| ふたば/X/Reddit/GitHub等をまたいだ実例調査 | [source-deep-dive](recipes/source-deep-dive.md) | source横断で結論を変える材料まで確認 |

### Twitch

ユーザーへVOD URLを探させない。handleを解決し、private local-controlが使える場合は `twitch_archive_search` でVOD候補を列挙する。「雑談系」等の意味判断はassistant側で再ランキングする。

DLはDiscoveryと分離し、選択されたVODだけlocal PCへ保存する。TwitchDownloaderCLIを第一backendとし、同一条件で既知のmetadata/quality failureを繰り返さない。詳細は `recipes/twitch-archive-discovery.md`。

### TwitCasting

ユーザーへmovie URLを探させない。channel / handleを解決し、private local-controlが使える場合は `twitcasting_archive_search` で `/archive` をFirefox認証付きyt-dlpから列挙する。同一movieはIDで重複排除し、合言葉付き等の解決不能entryはpartial errorとして区別する。

DLはDiscoveryと分離し、選択された `/movie/<id>` だけFirefox cookies + yt-dlpでlocal PCへ保存する。YouTube専用Deno/EJS互換argsは付けない。詳細は `recipes/twitcasting-archive-discovery.md`。

### YouTube

URLが不明な探索では通常Webだけに依存せず、private local-controlが使える場合は `youtube_search` のnative searchを利用できる。候補のtitle/channel/duration等を取得し、assistantが意味的にshortlistする。

保存は既存known-goodの **Firefox cookies + yt-dlp + Deno/EJS** 経路を使い、動画本体はGitHubへ返さずlocal PCにだけ置く。詳細は `recipes/youtube-video-discovery.md`。

### Withny

Withnyはログイン済みFirefoxの表示状態がDiscovery/recordingへ影響するため、private local-controlが使える場合は `withny_search` とpersistent Firefox sessionを使う。検索結果の「ライブ」表示だけでは現在liveとみなさず、channel状態と追加支払い要否を確認する。

録画ではFirefoxを候補ごと・fallbackごとに起動終了しない。同じsessionで対象を開いたまま、archiveは観測した直接media、liveはFirefox BiDiで実際に要求されたtoken付きAWS IVS HLSをローカルffmpegへ渡し、ffprobeまで確認する。署名/token付き完全URLはGitHubへ残さない。詳細は `recipes/withny-discovery.md`。

### X / Reddit / Futaba notes

X画像提示では外部 `pbs.twimg.com` URLをMarkdown画像にしただけではUIで表示されないことがある。`x-image-research.md` のknown-good transport pathを使う。

Redditは2026-08-26時点でGitHub Actions runnerからpublic HTML / thread RSSが403になった実測がある。ChatGPT webで元threadをopenできる場合はそちらを第一経路にし、同じ403 routeを繰り返さない。

ふたば過去ログは一般検索engineにindexされないことがある。Google/Bing 0件だけで不存在判定しない。

## Heavy media operations — explicit opt-in only

次は通常の動画探索・DLでは実行しない。ユーザーが明示的に求めた時だけ読む。

| Explicit request | Recipe | Completion |
| --- | --- | --- |
| 「文字起こしして」「発話内容をtimestamp付きで確認」 | [video-transcription](recipes/video-transcription.md) | 実音声→transcript/timestampsまで |
| 「この場面を見て」「映像/動作/画面変化を解析」 | [video-analysis](recipes/video-analysis.md) | 必要timestampをframe化しassistant visionで確認 |

文字起こしはWhisper/STTを伴うため重い。単に「動画探して」「保存して」「候補出して」では起動しない。

## Structure

```text
AIUse/
├─ README.md
├─ schemas/
├─ tools/
│  └─ <name>/
└─ recipes/
   └─ <workflow>.md
```

ツールは用途単位で自己完結させる。日付や会話単位では分けず、同じ目的の改善は同じ場所へ積む。

## Tool index

| Tool | Purpose | Entrypoint | Status |
| --- | --- | --- | --- |
| [futaba-thread-reader](tools/futaba-thread-reader/README.md) | ふたば現行スレをMarkdown / JSONへ整形 | `futaba_img_reader.py` | usable |
| [x-post-resolver](tools/x-post-resolver/README.md) | known X post本文・作者・mediaを正規化 | `x_post_resolver.py` | usable |
| [reddit-thread-reader](tools/reddit-thread-reader/README.md) | public Reddit thread正規化 | `reddit_thread_reader.py` | environment-sensitive; ChatGPT web preferred |
| [web-media-fetcher](tools/web-media-fetcher/README.md) | 直接media URLをローカル保存 | `web_media_fetcher.py` | usable |
| [browser-media-bridge](tools/browser-media-bridge/README.md) | browser cookie付きyt-dlp取得。YouTube Firefox routeの既存known-good資産 | `browser_media_bridge.ps1` | usable |
| [media-inspector](tools/media-inspector/README.md) | metadata / transcript / frame等の重い後段統合 | `media_inspector.py` | heavy; explicit use only |

検証harnessは通常routeでは呼ばない。

- `tools/video-transcription-smoke/`
- `tools/media-mcp-frames-smoke/`

## Recipe index

### Normal

| Recipe | Purpose |
| --- | --- |
| [research-routing](recipes/research-routing.md) | 通常Web→source固有Discovery→real-browser fallbackのrouter |
| [twitch-archive-discovery](recipes/twitch-archive-discovery.md) | Twitch archive候補発見→shortlist→PC直DL |
| [twitcasting-archive-discovery](recipes/twitcasting-archive-discovery.md) | TwitCasting archive候補発見→shortlist→Firefox認証付きPC直DL |
| [youtube-video-discovery](recipes/youtube-video-discovery.md) | YouTube native search→shortlist→PC直DL |
| [withny-discovery](recipes/withny-discovery.md) | Withny login済みDiscovery→persistent Firefoxでlive/archiveを開く→PC直保存 |
| [reddit-research](recipes/reddit-research.md) | Reddit thread/comment調査 |
| [x-image-research](recipes/x-image-research.md) | X元post/media確認→本文内実画像表示 |
| [futaba-archive-research](recipes/futaba-archive-research.md) | 消滅済みふたばスレの過去ログDiscovery |
| [source-deep-dive](recipes/source-deep-dive.md) | source横断の実例深掘り |

### Heavy / explicit only

| Recipe | Purpose |
| --- | --- |
| [video-transcription](recipes/video-transcription.md) | STT / transcript / timestamps |
| [video-analysis](recipes/video-analysis.md) | precision frame抽出 / vision確認 |

## Rules for future tools

新しい補助ツールを追加するときは最低限、Purpose / When to use / Inputs / Outputs / Usage / Dependencies / Limitations / Verificationを残す。

- 目的の分かる名前にする。
- UTF-8を基本にする。
- 一時出力、cache、Cookie、token、秘密鍵をcommitしない。
- 既存ツールで足りるなら新規実装しない。
- 新しい取得方式の前に既存実装・現行仕様を確認し、薄いwrapperを優先する。
- cross-source/downstreamの共通JSONが必要なら [`result-envelope-v1`](schemas/result-envelope-v1.md) を使う。

## Rules for recipes

recipeは未来のassistantが定型依頼を最後まで完了するためのチェックリスト。

- 通常Webで足りる場合は専用toolを無理に使わない。
- 「検索した」「URLを取れた」で止めない。
- UI上の見え方が成果物ならレンダリングまで完成条件に含める。
- source仕様が変わったらtoolだけでなくrecipeも見直す。
- 重い後段処理を通常routeへ勝手に追加しない。
