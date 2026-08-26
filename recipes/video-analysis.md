# Video analysis recipe

## Trigger

次の依頼ではこのrecipeを読む。

- 「この動画を見て」「映像では何が起きてる？」
- 「この動画から好きそうなキャラを探して」
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

## Browser-assisted local path

2026-08-26、private `kaillebidan-byte/AIUse-local-control` + Windows self-hosted GitHub Actions runnerを使った次の経路を実証した。

```text
ChatGPT / GitHub connector
  ↓ request JSON
private control repo
  ↓ push trigger
self-hosted Windows runner
  ↓
closed Firefox profileからYouTube auth
  ↓
yt-dlp + Deno/EJS
  ↓
local media cache
  ↓
必要なら Whisper small
  ↓
exact timestamp frames
  ↓
private results/<request-id>/ commit
  ↓
GitHub connector
  ↓
assistant vision
```

この経路が利用可能なら、ユーザーにPowerShell実行・ZIP作成・再アップロードを求める前にこちらを使う。

認証元は unattended path では `firefox` を標準とする。Vivaldiは対話的PowerShellでは成功したが、self-hosted Actions subprocessではChromium cookie DB copy/lockに繰り返し当たった。FirefoxはYouTubeログイン済みprofileを閉じておくことで成功した。

GitHub Actions artifactは必須にしない。検証時にartifact storage quotaへ到達したため、private control repoの `results/<request-id>/` へbot commitする経路を標準にした。

### Control modes

- `probe`: browser-authenticated metadataだけ確認。
- `video`: full video+audio取得。
- `transcribe`: 動画取得 + transcript生成。
- `analyze`: 動画取得 + Whisper + transcript timestamp frame抽出。
- `frames`: 既知timestampだけ抽出。Whisperを再実行しない。

`frames` は `timestamps_seconds` と `frame_width` を受け取れる。候補探索では小さいpreviewから始め、必要なtimestampだけ高解像度で再取得する。

### Private image transport

GitHub connectorのbinary/base64直返しは通常のJPEGでは出力上限に当たり得る。必要時は `emit_base64_text: true` を使う。

```text
JPEG
  ↓ local base64
1000文字ごとの行に分割した .b64.txt
  ↓ GitHub connector start_line/end_lineでページ取得
ChatGPT側で連結・decode
  ↓
assistant vision
```

実証では160px preview（5114 bytes）を7行のbase64 textにし、3回の範囲取得から5114-byte JPEGを完全復元してvision確認までPASSした。960px original frameもprivate repoには保持できるので、previewは選別用、詳細は選択後の追加取得用とする。

## Known-good source-build path

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
- キャラ候補探索 → まず小previewを広く取得し、候補timestampだけ高解像度に上げる。
- 全編の場面遷移を把握 → scene-change detection等を先に検討し、固定1fps大量抽出は最後の手段。

## Completion

- 動画取得成功とframe抽出成功を区別して把握した。
- 質問に必要なframeを実ファイルとして取得した。
- assistantがそのframeを実際にvisionで確認した。
- browser-assisted local pathが使える場合、ユーザー手動搬送を要求せず結果を回収した。
- 抽出枚数が不足する場合は結論を推測で補わず、必要なtimestampだけ追加した。

## Failure handling

- YouTube等で取得段階がbot/authに止められた場合、frame extractor不良と決めつけない。`video-transcription.md` と同様に取得層を別経路へ切り替える。
- VivaldiのChromium cookie DB copy/lockに当たるself-hosted jobでは、閉じたFirefox auth profileへ切り替える。
- GitHub Actions artifact quotaに当たったらprivate result commitへ切り替え、artifact quota回復待ちを要求しない。
- frame pathだけ返ってきても、ChatGPT側で画像を確認できなければ分析taskとして未完了。
- npm registry 404を再探索しない。upstream source buildへ切り替える。
