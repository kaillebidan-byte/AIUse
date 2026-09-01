# ChatGPT Inline Video Lite

ChatGPTの本文に含まれる動画/配信リンクへ、providerごとの軽量preview UIを追加するTampermonkey userscript。

Canonical source:

- `chatgpt-inline-video-lite.user.js`

RPLAY用に別userscriptは作らない。YouTube / TikTok / Bilibili / TwitCastingと同じ既存のURL抽出・dedupe・MutationObserver経路へRPLAY providerを統合する。

## RPLAY live

`https://rplay.live/live/<creatorOid>` を検出すると、既存のinline-video UIに次を追加する。

- `▶ RPLAY`: ChatGPT本文内iframeを試す。
- `↗ 小窓`: RPLAY liveページをトップレベルpopupで開く。ログイン/session依存ではこちらが安定経路。

RPLAY側でiframeが拒否された場合でも小窓経路は独立して使える。

## RPLAY recording handoff

同じuserscriptはRPLAY liveページにもinjectされる。browserが実際に取得したHTTP-FLV / HLS / MP4 media resourceを検出すると右下が

```text
録画準備中… → ● RPLAY録画
```

へ変化する。

録画buttonはsigned media URLをcustom protocol URIへ載せない。Tampermonkey clipboardへ一時的に渡し、`aiuse-rplay-record://` handlerがlocal process内へ回収した直後にclipboardを消去して `ffmpeg -c copy` を開始する。

保存先:

```text
%USERPROFILE%\Videos\AIUse\RPLAY\live\
```

Windows handler:

- `rplay_record_protocol.ps1`
- `install_rplay_record_protocol.ps1`

既に `aiuse-rplay-record://` を登録済みなら再登録不要。handlerのpayload schemaは従来と互換。

## One-time install / update

Tampermonkeyへ `chatgpt-inline-video-lite.user.js` を登録する。

v0.8.6-rplayから `@updateURL` / `@downloadURL` はこのGitHub canonical sourceを指すため、以後は同じscriptを更新する。

録画handlerを初回だけ登録する場合:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\chatgpt-inline-video-lite\install_rplay_record_protocol.ps1
```

## RPLAY discovery responsibility

userscriptは検索を行わない。現在live候補の発見・課金/無料gate分類はprivate `AIUse-local-control` の `rplay_search` が担当する。

現在liveはrendered DOMやfollow一覧をsource-of-truthにしない。RPLAYのglobal live metadataから列挙し、現在accountのaccess metadataを別段で付与する。無料フォロー/無料購読で開くliveは通常候補に残し、有料必須は通常候補から分離する。

## Verification

2026-09-02:

- source was derived from the supplied `ChatGPT Inline Video Lite 0.8.5-probe`, not a parallel frontend.
- assembled source SHA-256: `5db16cd39d987de6cf4ea776478aac0084433d7131c644970fe56143b1720da5`.
- `node --check` PASS in GitHub Actions.
- RPLAY HTTP-FLV → ffmpeg stream-copy → MKV was already manually verified.
- RPLAY current-live discovery smoke: 17 lives; public 8 / free-subscription 4 / external-live 4 / login-viewable 1. Free-subscription items remained in the default shortlist.

RPLAY iframe playback and one-click recording are browser E2E items; verify them against a live stream when one is selected from discovery.
