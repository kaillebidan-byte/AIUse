# futaba-thread-reader

## Purpose

`img.2chan.net` などのふたば☆ちゃんねる現行スレを取得し、広告・投稿フォームなどを除いて、LLMが読みやすいMarkdownまたはJSONへ整形する補助ツール。

ChatGPT側からスレURLを直接取得できる場合もあるため、主用途は **直接取得が失敗した場合のフォールバック**、または **レス構造を安定した形式へ正規化したい場合**。

消滅済みスレやURL不明の過去スレ探索はこのtoolの担当外。`recipes/futaba-archive-research.md` を使い、過去ログ検索で候補を発見してarchive本文を直接確認する。

## When to use

- `https://img.2chan.net/<board>/res/<thread>.htm` の本文を読みたい。
- 通常のWeb取得でページを読めない、または取得結果が不安定。
- レス番号、本文、時刻、そうだね数、添付画像URLを機械処理したい。

過去ログを探したい場合はこのreaderから始めず、`recipes/futaba-archive-research.md` へrouteする。

## Inputs / Outputs

Input:

- `2chan.net` 配下のスレURL (`.../<board>/res/<number>.htm`)

Output:

- デフォルト: UTF-8 Markdown
- `--json`: JSON

抽出対象:

- thread number
- post number
- timestamp
- そうだね数
- 消滅予定時刻（ページに存在する場合）
- subject（存在する場合）
- 本文
- 添付画像URL / filename

## Install

Windows:

```powershell
py -m pip install -r requirements.txt
```

## Usage

Markdownを標準出力:

```powershell
py futaba_img_reader.py "https://img.2chan.net/b/res/1462301292.htm"
```

ファイル保存:

```powershell
py futaba_img_reader.py "https://img.2chan.net/b/res/1462301292.htm" -o thread.md
```

JSON:

```powershell
py futaba_img_reader.py "https://img.2chan.net/b/res/1462301292.htm" --json
```

ローカルHTTP relay:

```powershell
py futaba_img_reader.py --serve 8765
```

```text
http://127.0.0.1:8765/read?url=<percent-encoded-thread-url>
```

`?format=json` を付けるとJSONを返す。

## Configurable live smoke

GitHub Actionsで実ネットワーク込みの確認をしたい場合:

1. mainからtemporary branchを作る。
2. branch上の `request-url.txt` を対象スレURLへ変更する。
3. draft PRをmain向けに作る。
4. `.github/workflows/futaba-thread-reader-live.yml` がreader本体を実行する。
5. `futaba-thread-reader-live-output` artifactとjob logを確認する。
6. テスト用PRをcloseする。

通常はworkflow本体を変更する必要はない。

## Access boundary

`--serve` は `127.0.0.1` のみで待ち受ける。ChatGPTの実行環境から、ユーザーPC上の `localhost` へ直接アクセスすることはできない。

外部から読み取らせる必要がある場合は、ユーザー側で管理するHTTPS tunnel等の背後に置く必要がある。ただし通常は、まずChatGPT自身のWeb取得を試し、それで不足した場合だけこのツールを使うほうが軽い。

## Parser notes

ふたば系HTMLの `blockquote` を本文の主アンカーとし、周辺の `No.<number>` から投稿を対応付ける。`No.1462301292そうだねx10` のように空白なしで連結された表示にも対応する。

文字コードはHTTP指定を優先し、必要に応じてCP932 / Shift_JIS / UTF-8をフォールバックする。

## Limitations

- スレ削除後の復元機能ではない。404になったスレは取得できない。
- 過去ログの検索・発見機能は持たない。一般検索で見つからない過去スレは `recipes/futaba-archive-research.md` で別経路を使う。
- ふたば側のHTML構造が大きく変更された場合はparser更新が必要。
- JavaScript実行を必要とする処理は行わない。
- 認証、Cookie維持、投稿機能は持たない。読み取り専用。

## Verification

Last verified: **2026-08-26**

確認範囲:

- `img.2chan.net/b/res/...htm` の現行スレHTML構造
- Python syntax check
- Markdown / JSON出力経路
- GitHub Actions上から実スレへのlive HTTP取得 **PASS**

Known live input:
`https://img.2chan.net/b/res/1462329741.htm`

実測:
- `thread_no = 1462329741`
- `post_count = 157`
- `image_posts = 1`
- OP No. `1462329741`
- OP本文 `評価がひっくり返り始めたな`
- JSON artifact生成までPASS

この実測により、2026-08-26時点ではGitHub-hosted runnerから `img.2chan.net` へ到達し、reader単体で現行スレを取得・解析できることを確認済み。
