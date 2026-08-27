# Research routing recipe

## Trigger
外部調査で、通常Webだけで足りるか、X / Reddit / GitHub / ふたば / 実ブラウザ等へ枝を広げるべきか判断する場面。

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
| ふたば現行 | `futaba-thread-reader` | URLがある場合 |
| ふたば消滅済み/URL不明 | `futaba-archive-research.md` | 一般検索0件を不存在判定に使わない |
| login必須、JS描画、検索UI、anti-index、通常fetch不能 | real-browser fallback | static公開ページに常用しない |
| 既知URLのX本文/media | `x-post-resolver` | Discoveryではなくresolution |

## Authenticated local discovery
利用可能な場合、private local-control経路をauthenticated sourceのDiscoveryに使える。

- X: logged-in Firefox session → `x-cli` native search。2026-08-28にLatest検索、`from:` query、50〜100件取得を実証。
- Browser fallback: `agent-browser`等の既存browser automationをlocal runnerから使用し、rendered DOMを返す。認証・profileはローカル側に保持し、結果だけをresearch evidenceとして返す。
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

## Failure routing
取得失敗は「情報がない」と同義にしない。少なくとも以下を区別する。

- no-result: source検索で候補なし
- blocked: 403 / bot / login wall
- render-required: HTML取得できるが必要情報がJS後に出る
- resolver-only: URLがないためresolverを使えない
- stale-index: 一般検索にまだindexされていない可能性
- source-mismatch: そのsourceが今回の情報に向いていない

失敗classが確定したら、次routeを変える。例: `blocked -> browser`、`resolver-only -> source native search`、`stale-index -> X/Reddit native`。

## Completion
- 結論を変え得るsourceを探索したか、使わない理由が成立している。
- source固有Discoveryで見つけた重要候補は、可能な範囲で元本文まで確認する。
- 一つの検索engineの0件だけで不存在を確定しない。
- 同じ失敗経路を理由なく繰り返さない。
- 複数sourceが必要な依頼では `source-deep-dive.md` のcompletionも満たす。
