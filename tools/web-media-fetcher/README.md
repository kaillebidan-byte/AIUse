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

## Dependencies
- Python 3.10+
- requests

## Limitations
- 認証Cookieが必要なmediaは取得しない。
- HTML page URLはmediaとして保存しない。
- access controlやrate limitの回避はしない。

## Verification
2026-08-26:
- Python syntax check PASS。
