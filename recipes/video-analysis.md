# Video analysis recipe

## Trigger

次の依頼ではこのrecipeを読む。

- 「この動画を見て」「映像では何が起きてる？」
- 動画内のキャラクター、画面表示、動作、構図、UI変化を確認したい
- transcriptだけでは答えられない動画分析
- 特定の発話時点・イベント時点を映像でも照合したい

音声内容そのものが主目的なら先に `video-transcription.md` を読む。

## Goal

動画URLやframe pathを返して終わらず、**必要な動画区間を実際の画像frameへ変換し、assistant visionで内容を確認した状態**まで進める。

## Preferred workflow

無差別な全編vision投入をデフォルトにしない。

```text
user question
  ↓
metadata / transcript / known timestamps
  ↓
見るべき時刻・短い範囲を選ぶ
  ↓
precision frame extraction
  ↓
assistant vision
  ↓
不足箇所だけ追加frame
```

既存実装として `woosal1337/media-mcp` の `extractFramesAtTimestamps` を優先する。AIUseでは `tools/media-mcp-frames-smoke/` に実証済みharnessがある。

## Known-good path

2026-08-26実証:

```text
direct video URL
  ↓
GitHub Actions runner
  ↓
clone/build woosal1337/media-mcp
  ↓
ffprobe duration
  ↓
extractFramesAtTimestamps
  ↓
JPG artifact
  ↓
ChatGPT /mnt/dataへ搬送
  ↓
assistant visionで実画像確認
```

Live2Diff公式のAnime Character demo動画で0/1/2秒を抽出し、3枚すべてvision確認までPASS。

## Installation boundary

upstream README/package metadataにはnpm利用を示す記述があるが、2026-08-26時点で `npm install media-mcp@1.2.0` はregistry 404になった。

現時点ではnpm packageを再試行せずGitHub source buildを使う。詳細は `tools/media-mcp-frames-smoke/README.md`。

## Frame-selection policy

- 発話に対応する表情・画面を見たい → transcript timestamp前後を数枚。
- UIや状態変化 → 変化前 / 直後 / 安定後を抽出。
- ポーズ・アニメーション → 必要区間だけ0.5〜2fps程度で追加抽出。
- 全編の場面遷移を把握 → scene-change detection等を先に検討し、固定1fps大量抽出は最後の手段。

## Completion

- 動画取得成功とframe抽出成功を区別して把握した。
- 質問に必要なframeを実ファイルとして取得した。
- assistantがそのframeを実際にvisionで確認した。
- 抽出枚数が不足する場合は結論を推測で補わず、必要なtimestampだけ追加した。

## Failure handling

- YouTube等で取得段階がbot/authに止められた場合、frame extractor不良と決めつけない。`video-transcription.md` と同様に取得層を別経路へ切り替える。
- frame pathだけ返ってきても、ChatGPT側で画像を確認できなければ分析taskとして未完了。
- npm registry 404を再探索しない。upstream source buildへ切り替える。
