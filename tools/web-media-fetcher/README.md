# web-media-fetcher

## Purpose
別toolやweb調査で得た**直接media URL**をローカルファイルへ保存し、画像・動画解析へ渡しやすくする。

## When to use
- X / Reddit / ふたば等で直接画像URLまでは取れたが、ローカルファイルとして扱いたい
- 複数画像をまとめて保存したい
- assistantの画像解析へ渡す前処理が必要

## Scope
このtoolはpage scraperではない。media URLの発見は`x-post-resolver`等に任せる。

## Usage
```powershell
py -m pip install -r requirements.txt
py web_media_fetcher.py "https://example.com/image.jpg" -d media
py web_media_fetcher.py -i urls.txt -d media
```

デフォルト上限は1ファイル100 MiB。変更:
```powershell
py web_media_fetcher.py URL --max-mb 250
```

## Configurable live smoke

GitHub Actionsで実ネットワーク込みの確認をしたい場合:

1. mainからtemporary branchを作る。
2. branch上の `request-urls.txt` に直接media URLを1行ずつ置く。
3. draft PRをmain向けに作る。
4. `.github/workflows/web-media-fetcher-live.yml` がfetcher本体を実行する。
5. `web-media-fetcher-live-output` artifactを取得する。
6. テスト用PRをcloseする。

## Dependencies
- Python 3.10+
- requests

## Known Reddit media route

2026-08-26実測では、GitHub-hosted runnerからのReddit CDN到達性に差がある。

- `external-preview.redd.it/...` → **HTTP 403**
- native original `https://i.redd.it/<filename>` → **PASS**

したがって、Reddit検索結果やページから `preview.redd.it` / `external-preview.redd.it` 系URLを得た場合、同一mediaのnative `i.redd.it` original URLを確認できるならそちらを優先する。単純変換で必ず同一mediaになるとは限らないため、filenameと元postの対応は確認する。

Known live PASS:
`https://i.redd.it/qy058oi4ozkh1.png`

実測:
- saved filename: `qy058oi4ozkh1.png`
- bytes: `401964`
- PNG magic: `89504e470d0a1a0a`
- artifact uploadまでPASS

この画像は直近のr/StableDiffusion「Testing some Minimax H3 capabilities」周辺で参照されたnative Reddit画像をlive test inputとして使用した。

## Failure ledger

2026-08-26:
1. `external-preview.redd.it` のpreview画像をGitHub Actionsから直接取得 → HTTP 403。
2. 同じReddit系でもnative `i.redd.it` originalは取得成功。
3. preview CDNで403が出た場合、User-Agent変更などを延々試す前にnative originalの有無を確認する。

## Limitations
- 認証Cookieが必要なmediaは取得しない。
- HTML page URLはmediaとして保存しない。
- access controlやrate limitの回避はしない。
- `preview` から `i.redd.it` への変換はURL構造次第。存在しないoriginal URLを推測して成功扱いしない。

## Verification
2026-08-26:
- Python syntax check PASS。
- GitHub Actions live network test PASS (`i.redd.it` PNG)。
- artifactとして会話側へ搬送し、PNG実ファイルとして展開・確認PASS。
- Reddit `external-preview.redd.it` は同環境でHTTP 403になる境界を確認。
