# x-post-resolver

## Purpose
X / Twitter の公開post URLを、assistantが扱いやすいMarkdown / JSONへ正規化する。本文、作者、日時、metrics、添付media URL、quoteをまとめて取得する。

**重要:** このtoolの成功は「post/media URLを解決できた」という中間成功。ユーザーが「画像を本文に載せて / 貼って / 見せて」と要求している場合、このtoolだけではtask完了ではない。必ず [`recipes/x-image-research.md`](../../recipes/x-image-research.md) のCompletionまで進める。

## When to use
- 「このXを見て」
- 「この投稿の画像を本文に載せて」
- X投稿を画像解析・比較の入力にしたい
- 通常のweb取得でX本文やmediaが欠ける

## Strategy
1. FxTwitter API v2 (`/2/status/{id}`) を優先。
2. 失敗時に `gallery-dl -J` をfallbackとして利用。
3. gallery-dlも使えない場合は明示的に失敗する。

FxTwitterとgallery-dlは外部依存なので、仕様変更時はREADMEのVerificationを更新する。

## Inputs / Outputs
Input: `x.com/.../status/<id>` または `twitter.com/.../status/<id>`

Default output: Markdown

`--json`: normalized JSON

mediaは原則としてURLで返す。**ChatGPT本文へのbinary搬送・描画はこのtoolの責務外**であり、`x-image-research` recipe側で処理する。

## Usage
```powershell
py -m pip install -r requirements.txt
py x_post_resolver.py "https://x.com/user/status/123456789"
py x_post_resolver.py "https://x.com/user/status/123456789" --json -o post.json
```

Fallbackを有効にする場合:
```powershell
py -m pip install gallery-dl
```

FxTwitterを飛ばしてgallery-dlだけ試す:
```powershell
py x_post_resolver.py URL --gallery-dl --json
```

## Dependencies
- Python 3.10+
- requests
- optional: gallery-dl

## Limitations
- protected / deleted / login-required postsは対象外。
- FxTwitterは第三者service。レスポンスschema不整合や一時障害はあり得る。
- gallery-dlのraw JSONは安定した自前schemaではないため、fallback時はmedia抽出を主目的に扱う。
- X検索そのものはこのtoolの責務外。検索でpost URLを特定してから使う。
- `pbs.twimg.com` URLを返せても、ChatGPT UIでその外部URL Markdown画像が描画される保証はない。
- ChatGPT側のPython実行環境は外向きDNS/networkが塞がれる場合がある。その場合はtool不良と誤判定せず、recipe記載のGitHub Actions transportを使う。

## Verification
2026-08-26:
- FxTwitter API v2のOpenAPIと`/2/status/{id}`実例を確認。
- gallery-dlの`-J / --resolve-json`を現行docsで確認。
- Python syntax check PASS。
- GitHub Actions上で実ネットワークを使ったlive smoke PASS。
  - Known input: `https://x.com/azurlane_staff/status/2086709129742028826`
  - `source=fxtwitter-v2`
  - author `azurlane_staff` / id / text を正しく取得。
  - 原寸photo 2件を取得（2009x1331, 1812x2930）。
  - FxTwitter mosaic JPEG / WebP も取得。
  - live smoke workflow: `.github/workflows/smoke-x-post-resolver.yml`
- 同じknown inputでmedia download → Actions artifact → ChatGPT `/mnt/data` → `sandbox:` Markdown imageまで通し、本文内実画像表示を確認。詳細は `recipes/x-image-research.md` のKnown-good ChatGPT transport pathを参照。
