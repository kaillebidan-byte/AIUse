# media-mcp frame extraction smoke

既存実装 `woosal1337/media-mcp` の動画フレーム抽出を、AIUseから再現可能に検証するためのharness。

目的は独自frame extractorを作ることではない。media-mcpの `extractFramesAtTimestamps` / `get_video_frames_at` 相当経路が実動画で動き、抽出JPGをChatGPT側へartifact搬送してvision確認できるかを試す。

## Test procedure

1. mainからtemporary branchを作る。
2. `request-url.txt` に直接動画URLを1行置く。
3. 必要なら `timestamps.txt` を変更する。
4. draft PRをmain向けに作る。
5. `.github/workflows/media-mcp-frames-live.yml` が published `media-mcp` packageを使って指定時刻フレームを抽出する。
6. `media-mcp-frames-live-output` artifactを会話側へ搬送し、JPGを実際にvisionで確認する。
7. PRをcloseする。

URL取得成功だけ、frame path出力だけでは完了扱いにしない。最終的に抽出画像を実際に確認する。
