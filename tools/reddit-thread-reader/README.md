# reddit-thread-reader

## Purpose
公開Reddit threadのOPとcommentをMarkdown / JSONへ正規化する補助ツール。Reddit Data APIの未認証`.json`には依存しない。

## When to use
- 「このRedditスレ読んで」
- 検索結果で見つけたthreadをコメントまで精読する
- Reddit調査で検索snippetだけでは足りない
- **実行環境からReddit public HTML/RSSへ到達できる場合**

## Strategy
第一経路は公開HTMLの`shreddit-post` / `shreddit-comment`。API keyは使わない。

2026-08-26のlive testでGitHub Actions runnerはpublic HTMLをHTTP 403で拒否された。RSS fallbackも同runnerでは403だったため、**ChatGPT用途ではこのtoolをGitHub Actions経由の第一経路にしない**。ChatGPT web取得で元threadをopenできる場合はそちらを使う。

RSS方式そのものは既存実装 `ninjackster/reddit-rss-mcp` を確認済み。Redditのcomment RSSを使う場合、flat comment / scoreなし / 約25件上限という制約がある。

## Usage
```powershell
py -m pip install -r requirements.txt
py reddit_thread_reader.py "https://www.reddit.com/r/.../comments/.../"
py reddit_thread_reader.py URL --json -o thread.json
```

## Dependencies
- Python 3.10+
- requests
- beautifulsoup4

## Limitations
- Reddit側がログイン、CAPTCHA、rate limit、bot mitigationを返した場合は回避しない。
- 初期HTMLに未展開commentが含まれない場合、そのcommentは取得できない。
- `shreddit-*` DOM変更でparser更新が必要になる可能性がある。
- subreddit横断検索はこのtoolの責務外。
- GitHub Actions IPからは2026-08-26時点でHTML/RSSとも403を確認。

## Failure ledger
### 2026-08-26 — GitHub Actions live test
Known input:
`https://www.reddit.com/r/SillyTavernAI/comments/1vxmvf3/your_favourite_ai_model/`

1. public HTML fetch → `HTTP 403`
2. per-thread `.rss` fallback → `HTTP 403`
3. 同じthreadはChatGPT web取得ではOP/commentとも取得可能

結論:
- parser不良とnetwork-policy拒否を混同しない。
- GitHub ActionsでHTML→RSSを繰り返して時間を使わない。
- ChatGPTセッションでは `recipes/reddit-research.md` に従いweb取得を優先。

## Current Reddit access note
2026-05末以降、未認証`.json`が403になったというredditdev報告が多数ある。RSSは一般にはまだ利用例があるが、実行元IPによってはHTML/RSSの両方がnetwork policyで弾かれる。

## Verification
2026-08-26:
- 現行`shreddit-post` / `shreddit-comment`構造の利用例を確認。
- Python syntax check PASS。
- GitHub Actions live network test: **HTML 403 / RSS 403**。
- ChatGPT web経路では同一Reddit threadのOP/comment取得を確認。
