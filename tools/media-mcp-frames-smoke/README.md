# media-mcp frame extraction smoke

既存実装 `woosal1337/media-mcp` の動画フレーム抽出を、AIUseから再現可能に検証するためのharness。

目的は独自frame extractorを作ることではない。media-mcpの `extractFramesAtTimestamps` / `get_video_frames_at` 相当経路が実動画で動き、抽出JPGをChatGPT側へartifact搬送してvision確認できるかを試す。

## Test procedure

1. mainからtemporary branchを作る。
2. `request-url.txt` に直接動画URLを1行置く。
3. 必要なら `timestamps.txt` を変更する。
4. draft PRをmain向けに作る。
5. `.github/workflows/media-mcp-frames-live.yml` がupstream `woosal1337/media-mcp` をclone/buildし、指定時刻フレームを抽出する。
6. `media-mcp-frames-live-output` artifactを会話側へ搬送し、JPGを実際にvisionで確認する。
7. PRをcloseする。

URL取得成功だけ、frame path出力だけでは完了扱いにしない。最終的に抽出画像を実際に確認する。

## Why source build

2026-08-26実測では upstream `package.json` は `media-mcp` version `1.2.0` を名乗り、READMEも `npx media-mcp` 系の導入を案内しているが、npm registryへの `media-mcp@1.2.0` installは **404 Not Found** になった。

そのため現時点のknown-good pathはnpm packageではなくGitHub source build:

```text
git clone --depth 1 https://github.com/woosal1337/media-mcp.git
npm ci
npm run build
```

同じnpm installを繰り返さない。

## Known-good live test

2026-08-26:

Input:
`https://github.com/user-attachments/assets/42727f46-b3cf-48ea-971c-9f653bf5a264`

これはLive2Diff公式READMEの `Anime Character (Screen Video Input)` demo動画。

Requested timestamps:
- 0.0 s
- 1.0 s
- 2.0 s

Result:
- source build: PASS
- direct video download: PASS
- video duration: `15.733333 s`
- ffprobe / ffmpeg precision extraction: PASS
- `frame_000_0.00s.jpg`: 286,638 bytes
- `frame_001_1.00s.jpg`: 287,512 bytes
- `frame_002_2.00s.jpg`: 370,827 bytes
- artifact upload: PASS
- ChatGPT側へartifact搬送・JPG展開: PASS
- assistant visionによる実画像確認: PASS

Vision checkでは、0〜1秒は左側に銀髪・黄緑アクセントのアニメ少女を含む入力画面と右側の待機中Web UI、2秒ではそのキャラクターがWebCam入力欄へ表示された状態を確認できた。

## Dependency note

upstream sourceの `npm ci` 実行時、npm audit summaryに `10 vulnerabilities (2 low, 3 moderate, 5 high)` が表示された。今回のframe extraction成立性とは別事項で、個々の到達可能性や実害は未監査。公開サービス化など別リスク条件が生じるまで、これだけを理由に独自再実装へ移らない。

## Preferred use

動画全編を固定1fps等で大量にvisionへ送るより、まずtranscript・metadata・ユーザーの質問から重要timestampを絞り、`extractFramesAtTimestamps` で必要箇所だけ見る。

```text
transcript / question
  ↓
relevant timestamps
  ↓
precision frame extraction
  ↓
assistant vision
```

全編の映像変化そのものが質問対象の場合だけ、範囲指定 + 低fpsのbulk extractionを使う。
