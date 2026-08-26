# reddit-thread-reader

## Purpose
公開Reddit threadのHTMLからOPと読み込めたcommentをMarkdown / JSONに正規化する。Reddit Data APIの未認証`.json`に依存しない。

## When to use
- 「このRedditスレ読んで」
- 検索結果で見つけたthreadをコメントまで精読する
- Reddit調査で検索snippetだけでは足りない

## Strategy
現在のReddit HTMLにある`shreddit-post` / `shreddit-comment` web componentsを読む。API keyは使わない。

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

## Current Reddit access note
2026-05以降、未認証`.json`が403になったというredditdev報告が複数ある。2026-08-05のReddit公式投稿ではPublic Data APIの段階的制限方針が示された一方、「今年中に大きく変更しない」と説明されている。したがってこのtoolは公開HTMLを第一経路にする。

## Verification
2026-08-26:
- 現行`shreddit-post` / `shreddit-comment`構造の利用例を確認。
- Python syntax check PASS。
