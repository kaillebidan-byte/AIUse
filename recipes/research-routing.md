# Research routing recipe

## Trigger
外部調査で、通常Webだけで足りるか、X / Reddit / GitHub / Twitch / TwitCasting / RPLAY / ふたば / 実ブラウザ等へ枝を広げるべきか判断する場面。

## Goal
検索engineの上位結果だけで早上がりせず、結論を変え得るsourceへだけ追加探索を出す。tool数を増やすこと自体を目的にせず、検索・Discovery・本文取得・browser fallbackを分離する。

## Routing principle
1. まず通常Web検索で対象、期間、固有名詞、引用候補、一次source候補を広く掴む。
2. 得られた人物名、handle、製品名、引用文、post/thread id、独特な語彙を次のqueryへ展開する。
3. source固有の情報が結論を変え得る場合だけ、そのsourceのDiscoveryへ枝を出す。
4. source固有Discoveryで候補URLを得たら、resolver / reader /元ページで実物を確認する。
5. login壁、JS-only表示、anti-bot、非indexページで通常取得が詰まった場合だけ実ブラウザへfallbackする。
6. 同じtask内で既に失敗理由が確定した経路は、条件が変わらない限り繰り返さない。

## Source routing

| Signal | Preferred route | Notes |
| --- | --- | --- |
| 速報、スタッフ発言、告知、social reaction、X上の引用元 | X native Discovery | URL既知前提にしない。query検索→候補post→必要なら `x-post-resolver` |
| Redditの評判、体験談、thread/comment | ChatGPT webでRedditを直接open | GitHub-hosted runnerの403既知。`reddit-research.md`を併用 |
| repo、issue、PR、実装、release | GitHub connector / GitHub native search | 一般Webよりsource専用検索を優先 |
| Twitch配信者のVOD/アーカイブ候補、曖昧な「雑談系」等 | `twitch-archive-discovery.md` | channel解決後はTwitch VOD一覧をnativeに列挙し、assistantが意味的に再ランキング。DLはTwitchDownloaderCLIへ分離 |
| TwitCasting配信者の録画一覧、ツイキャスの雑談候補 | `twitcasting-archive-discovery.md` | handle解決後はFirefox認証付き `/archive` を列挙し、重複・合言葉付きentryを区別。選択movieだけyt-dlp保存 |
| RPLAYのcreator/live/replay/file候補、RPLAY内検索、音声素材探索 | `rplay-discovery.md` | Firefox認証付きrendered UIから候補を列挙。選択pageはbrowserが実際に観測したmedia resourceだけlocal ffmpeg保存 |
| ふたば現行 | `futaba-thread-reader` | URLがある場合 |
| ふたば消滅済み/URL不明 | `futaba-archive-research.md` | 一般検索0件を不存在判定に使わない |
| login必須、JS描画、検索UI、anti-index、通常fetch不能 | local Firefox browser fallback | static公開ページに常用しない。対象domainのCookieを持つFirefox profileを自動選択 |
| 既知URLのX本文/media | `x-post-resolver` | Discoveryではなくresolution |

## Authenticated local discovery
利用可能な場合、private `AIUse-local-control` 経路をauthenticated/source-specific Discoveryに使える。

- X: logged-in Firefox session → `tamnd/x-cli` native search。2026-08-28にLatest検索、`from:` query、50〜100件取得を実証。既知URLは不要。
- Twitch archives: channel handle → current yt-dlp Twitch playlist extractor → VOD候補JSON/Markdown。2026-08-28にlocal runnerで候補URL・title・duration・view count取得を実証。`filter=archives`が0件の場合は`filter=all`へfallbackし、その事実を結果へ記録する。
- TwitCasting archives: handle → Firefox cookies + yt-dlp TwitCasting `/archive` extractor → movie候補JSON/Markdown。2026-08-28に `z6kr0` で3件のunique録画取得を実証。合言葉付きentryはpartial errorとして区別し、候補へ偽装しない。
- RPLAY: `rplay_search` → RPLAY domain cookieを持つFirefox profileでrender → search UIまたはcreator pageから `live / file / play` 候補を列挙。保存時はcredential付きmedia URLをlocal process内だけに保持し、GitHub resultへtoken/user/session値を出さない。
- Browser fallback: Selenium + Firefox existing-profile clone。対象URLのdomain Cookieを持つFirefox profileをローカルで選び、そのprofileをWebDriver用にcloneしてrendered DOM / HTML / interactive snapshotを返す。元profileは変更しない。
- 2026-08-28に通常ページのrendered readと、`x.com/home`でFirefoxの既存Xログインを継承したauthenticated readを実証。
- 通常Webで足りる場合はlocal runnerを使わない。

## Query expansion
初回query一発で終えない。次のどれかが見つかった場合は追加query候補にする。

- 人物名 / handle
- 正確な短い引用
- product / feature固有名
- 日付・時刻・期間
- error文、issue番号、post/thread id
- source内で使われている独特な言い回し

例:

```text
Web/Reddit: "Tibo said yesterday"
→ X: Tibo Codex reset
→ X: from:thsottiaux reset
→ 候補post本文と日時を確認
```

```text
User: "〇〇の雑談系Twitchアーカイブ"
→ Web/Twitch: channel handle解決
→ Twitch native archive list
→ titles/durationsをassistantが意味的にshortlist
→ user selects candidate
→ TwitchDownloaderCLI local download
```

```text
User: "〇〇のツイキャス配信一覧"
→ handle解決
→ Firefox-authenticated TwitCasting archive list
→ 重複・アクセス不能entryを整理
→ assistant shortlist
→ user selects movie
→ Firefox-authenticated yt-dlp local download
```

```text
User: "RPLAYで〇〇のASMR/公開リプレイを探して"
→ RPLAY Firefox-authenticated `rplay_search`
→ rendered `live/file/play` candidates
→ assistant shortlist
→ user selects page
→ browser-observed media resourceをlocal ffmpeg stream-copy
```

## Failure routing
取得失敗は「情報がない」と同義にしない。少なくとも以下を区別する。

- no-result: source検索で候補なし
- blocked: 403 / bot / login wall
- render-required: HTML取得できるが必要情報がJS後に出る
- resolver-only: URLがないためresolverを使えない
- stale-index: 一般検索にまだindexされていない可能性
- source-mismatch: そのsourceが今回の情報に向いていない

失敗classが確定したら、次routeを変える。例: `blocked -> browser`、`resolver-only -> source native search`、`stale-index -> X/Reddit native`。

### Known local failures

- `vercel-labs/agent-browser v0.35.1` + Vivaldi custom executableは、2026-08-28のWindows self-hosted runner実測でVivaldi processまでは起動するが `open` が返らずhangした。条件・version・upstreamが変わらない限り再試行しない。
- browser fallbackは現在、上記経路ではなくSelenium + Firefox profile cloneを既知良好経路として使う。
- RPLAY media URLは一時token/user/session queryを含み得るため、同じexpired URLを反復しない。再取得はFirefox pageから新しいresourceを観測する。

## Completion
- 結論を変え得るsourceを探索したか、使わない理由が成立している。
- source固有Discoveryで見つけた重要候補は、可能な範囲で元本文まで確認する。
- 一つの検索engineの0件だけで不存在を確定しない。
- 同じ失敗経路を理由なく繰り返さない。
- 複数sourceが必要な依頼では `source-deep-dive.md` のcompletionも満たす。
