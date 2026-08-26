# AIUse

AI / assistant workflows用の小さな補助ツール置き場。

このリポジトリは、特定の作業で必要になった取得・変換・検査などを、後のセッションでも再利用できる形で保存するために使う。

## Future assistant entrypoint

後からこのリポジトリを使う場合は、まずこのREADMEの **Tool index** を確認し、目的に合う `tools/<name>/README.md` だけ読む。必要がない限りリポジトリ全体を走査しない。

## Structure

```text
AIUse/
├─ README.md                  # 全体索引・運用規則
├─ .gitignore
└─ tools/
   └─ <tool-name>/
      ├─ README.md            # 目的、使用条件、入出力、制約、検証日
      ├─ requirements.txt     # Python依存がある場合
      └─ <entrypoint>         # 実行本体
```

ツールは用途単位で自己完結させる。日付や会話単位では分けず、同じ目的の改善は同じディレクトリへ積む。

## Tool index

| Tool | Purpose | Entrypoint | Status | Last verified |
| --- | --- | --- | --- | --- |
| [futaba-thread-reader](tools/futaba-thread-reader/README.md) | ふたば☆ちゃんねるの現行スレをLLM向けMarkdown / JSONへ整形 | `futaba_img_reader.py` | usable | 2026-08-26 |

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
