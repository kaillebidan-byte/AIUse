# RPLAY live recorder

## Purpose

RPLAY liveをブラウザで再生している状態から、signed HTTP-FLV/HLS URLを手作業でDevToolsからコピーせずに、ローカルffmpeg録画へ渡すための軽量helper。

```text
ChatGPT内のRPLAY liveリンク
  ├─ 別窓で開く
  └─ inline iframeを試す
        ↓
RPLAY pageで通常再生
        ↓
userscriptがbrowser resourceからlive media URLを検出
        ↓
[● RPLAY録画]
        ↓
Tampermonkey clipboard handoff
        ↓
aiuse-rplay-record:// custom protocol
        ↓
PowerShell → ffmpeg -c copy
        ↓
%USERPROFILE%\Videos\AIUse\RPLAY\live\*.mkv
```

常駐localhost serverは使わない。

## Files

- `rplay-live-recorder.user.js`
  - Tampermonkey userscript。
  - `rplay.live`では再生resourceを監視し、録画buttonを出す。
  - ChatGPTではRPLAY liveリンクへ`別窓` / `インライン`buttonを足す。
- `install_rplay_record_protocol.ps1`
  - current userだけに `aiuse-rplay-record://` URL protocolを登録する。
  - handlerを `%LOCALAPPDATA%\AIUse\rplay-live-recorder\` へ置く。
  - sibling handlerが無い単体実行時はpublic AIUse rawからhandlerを取得する。
  - setup後、既定browserでuserscript URLを開く。
- `rplay_record_protocol.ps1`
  - clipboardからsigned media URLを受け取り、即clipboardを空にしてffmpegを起動する。

## One-time setup

### Repo cloneがある場合

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\rplay-live-recorder\install_rplay_record_protocol.ps1
```

installerはprotocol登録後、Tampermonkey userscript URLを既定browserで開く。Tampermonkey側で`インストール`を押す。

### Installerだけ取得する場合

```powershell
$u='https://raw.githubusercontent.com/kaillebidan-byte/AIUse/main/tools/rplay-live-recorder/install_rplay_record_protocol.ps1'
$p=Join-Path $env:TEMP 'install_rplay_record_protocol.ps1'
Invoke-WebRequest -UseBasicParsing $u -OutFile $p
powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

handlerはinstallerが取得するため、repo cloneは不要。

`ffmpeg` がPATHにあることが前提。

登録解除:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\rplay-live-recorder\install_rplay_record_protocol.ps1 -Uninstall
```

## Usage

### RPLAY page / popup

1. live pageを通常再生する。
2. userscriptが `livestream.rplay.live` のFLV/HLS等を見つけるまでbuttonは `録画準備中…`。
3. resourceを検出すると `● RPLAY録画` になる。
4. buttonを押す。
5. 初回だけbrowserがcustom protocolを外部appで開く確認を出す可能性がある。
6. PowerShell windowが開き、ffmpeg stream-copy録画を開始する。
7. 停止はそのPowerShellで `q`。
8. 終了後、保存fileをExplorerで選択表示する。

### ChatGPT

RPLAY liveリンクの横へ次を追加する。

- `別窓`: login/sessionを通常browser contextで使うpopup。第一候補。
- `インライン`: iframe埋め込みを試す。ChatGPT CSP、RPLAY frame policy、third-party cookie制約で使えない場合は別窓へ戻る。

iframe内でもTampermonkeyがRPLAY frameへinjectされれば録画buttonを表示できる。

## Security / token handling

RPLAY live media URLはqueryに一時token、user ID、session ID等を含み得る。

このtoolでは:

1. userscriptがmedia URLをTampermonkey clipboardへ置く。
2. custom protocol URI自体にはmedia URL/tokenを入れない。
3. PowerShell handlerがclipboardを読み込んだ直後にclipboardを空にする。
4. signed URLをGitHub、file、manifestへ保存しない。
5. handlerは `https` かつRPLAY media host/pathだけを受け付ける。

つまりtokenはbrowser memory → clipboard → recorder processのlocal handoffだけに限定する。

## Current verification

2026-09-02に手動経路でRPLAY live HTTP-FLV → `ffmpeg -c copy` → MKV保存を実証済み。

今回のuserscript/protocol helperはその手作業:

```text
DevTools → x-flv request → URLコピー → PowerShellへ長いffmpeg command貼付
```

をbutton化するprototype。

実ライブでのend-to-end one-click確認は次のlive配信時に行う。

## Limitations

- live resourceがbrowserへ出る前は録画buttonは有効にならない。
- playerがresourceを切り替えた場合、既に起動したffmpegは現在のconnectionを使い続ける。切断時の自動reconnectは別改善。
- iframeがChatGPT/RPLAY側で拒否される場合はinline再生不可。popup routeは影響を受けない。
- custom protocolはcurrent Windows userのregistryへ登録するためone-time setupが必要。
- このprototypeは録画開始を簡易化する。background service化や複数同時録画管理はまだ行わない。
