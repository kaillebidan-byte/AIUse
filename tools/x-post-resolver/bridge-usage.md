# X media bridge usage

ChatGPT側の実行環境から外向きHTTP/DNSが使えず、X画像を本文表示まで搬送したい場合の短縮手順。

1. mainからtemporary branchを作る。
2. そのbranchの `tools/x-post-resolver/request-url.txt` を対象X status URLへ変更する。
3. draft PRをmain向けに作る。
4. `.github/workflows/smoke-x-post-resolver.yml` の `x-post-media-bridge` がPR差分で起動する。
5. workflow完了後、`x-post-resolver-live-media` artifactを取得する。
6. `download_workflow_artifact` で会話側へZIPを搬送する。
7. `/mnt/data` に展開し、`photo_*.jpg/png/webp` を `![...](sandbox:/mnt/data/...)` で本文表示する。
8. PRをcloseする。

`request-url.txt` 以外のworkflow改造は通常不要。

注意:
- photo添付post向け。video-only postは現状対象外。
- 外部画像URLのMarkdown直書きは本文表示の完成条件に数えない。
- push runがconnectorから追いにくい場合があるため、artifactをChatGPT側で回収する用途ではPR起点を使う。

## Verification
2026-08-26:
- mainのknown inputは `x.com/azurlane_staff/status/2086709129742028826`。
- temporary branchでは `request-url.txt` だけを `twitter.com/azurlane_staff/status/2086709129742028826` に変更。
- draft PR #3 から `x-post-media-bridge` が起動。
- resolve / normalized photo assertion / media download / artifact upload がすべてPASS。
- `x-post-resolver-live-media` artifact生成を確認。
- つまり、対象postごとのworkflow書き換えなしで `request-url.txt` 差し替えだけの経路を実証済み。
