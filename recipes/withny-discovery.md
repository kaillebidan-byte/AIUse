# Withny discovery / recording

Withnyで配信者・現在ライブ・アーカイブを探し、選択されたコンテンツをWindows PCへ保存するための標準route。

privateな認証、Firefox profile、署名付きmedia URLは `AIUse-local-control` 側だけで扱う。このpublic recipeには秘密情報を置かない。

## When to use

- 「Withnyで今配信している人を探して」
- 「この配信者のWithnyアーカイブを探して」
- 「候補を開いて、録画と言ったら保存して」
- RPLAY等で対象が見つからず、Withny配信の可能性がある時

普通のWeb検索だけで候補と現在状態が十分に確認できる場合は、無理にlocal-controlを起動しない。ログイン後の実表示、現在live、保存可否が結論を変える時に使う。

## Discovery

private local-controlが使える場合、`withny_search` を使う。

標準経路:

```text
ChatGPT
  -> withny_search
  -> Windows側のpersistent Firefox session
  -> Withnyの実検索UI / schedule / channel
  -> candidate list
  -> public channel HTMLによるlive/access postprocess
  -> assistant shortlist
```

重要:

- Firefoxは検索ごとに起動・終了しない。同じpersistent sessionを再利用する。
- 検索結果の見た目に「ライブ」とあっても、それだけで現在liveと判定しない。
- channelの現在状態をpostprocessで確認し、古いlive cardやscheduleを現在配信中として扱わない。
- `無料` / 既に視聴権があるものと、追加支払いが必要なものを区別する。
- 購入やポイント消費を自動実行しない。
- schedule pageから配信者profile/channelを解決できる場合は、そのcanonical channelを以後のopen/recordに使う。

典型的なWithny URL:

```text
https://www.withny.fun/user/profile/<handle>
https://www.withny.fun/channels/<handle>
https://www.withny.fun/schedules/<id>
https://www.withny.fun/archives/<id>
```

## Persistent open

候補を確認した後は、同じFirefox workerでchannel/archiveを開く。

```text
search
  -> open selected page
  -> keep Firefox/session alive
  -> wait for user decision or live start
```

同じURLを再確認する時は、可能なら現在ページを再利用する。`Firefox起動 -> page open -> Firefox終了` をfallbackごとに繰り返す設計へ戻さない。

ライブ開始待ちでは、同一channel page上でvideoが再生可能状態へ変わることを確認できる。

## Recording

### Archive

無料または現在アカウントで視聴可能なarchiveをpersistent Firefoxで再生し、ブラウザが利用している直接HTTP mediaを観測する。

```text
persistent Firefox
  -> playable archive
  -> observed direct media
  -> ffmpeg -c copy
  -> ffprobe
  -> %USERPROFILE%\Videos\AIUse\Withny\<owner>\
```

### Live

Withny liveはAWS IVSを使用する。親channel HTMLに見えるtoken無しplaylistをそのままffmpegへ渡すと403になる場合がある。

標準経路は、**実際のFirefox playerが要求した認可済みHLS request**をSelenium BiDi network observerで観測し、そのURLをローカルでffmpegへ渡す。

```text
same persistent Firefox session
  -> live video playing
  -> Selenium BiDi before_request observation
  -> token-bearing authorized IVS HLS
  -> ffmpeg -c copy
  -> ffprobe
```

署名/token付き完全URLはmemory/local runtime内だけで扱い、GitHub resultへ書かない。resultにはhost、transport、query key名、token queryの有無等の安全なmetadataだけを残す。

## User flow

対話上の標準形:

```text
1. assistantがWithnyで候補を探索
2. 無料/現在視聴可能な候補を選ぶ
3. persistent Firefoxで対象を開く
4. ユーザーが「録画」と指示
5. 同じsessionからrecord command
6. local fileとffprobeを確認して報告
```

初回・新しいrouteのsmokeでは、ユーザーが別時間を指定していなければ短いbounded recordingを使う。本番では指定された長さ・終了条件に従う。

## Verified 2026-09-04

### Archive E2E

龍涎にこみの無料archiveでpersistent Firefoxから直接mediaを取得。

```text
duration: 20.199s
video: H.264 1280x720
audio: AAC 48kHz stereo
ffprobe: PASS
persistent_session: true
```

### Live persistent-session E2E

七猫ちゃんの06:30開始無料liveで、開始前から同一channel pageを保持して検証。

```text
creator/channel: 77neko_ch
same worker PID across pre-open/live-check/record: 10168
live check: video has_src=true / paused=false / readyState=3
navigation on live check: reused_current_page=true
record backend: persistent-firefox-bidi-ivs
transport: HLS
observed authorized IVS playlist: token query present
duration: 20.011s
video: H.264 (1280x720 variant included)
audio: AAC 48kHz stereo
ffprobe: PASS
```

このテストで、検索・事前open・live化・録画をFirefoxの再起動なしで一本通しできることを確認した。

## Failure handling

- 現在liveが0件なら、古いlive cardを無理に録画対象にしない。
- schedule開始前ならchannelを解決して事前openできるが、実際に再生可能になるまでrecord成功扱いにしない。
- token無しIVS URLで403になったら同じ裸URLを繰り返さず、Firefoxが実際に要求した認可済みrequestを観測する。
- DRM/暗号化等で通常の視聴権の範囲から取得できない場合はそこで止める。
- paid/unentitled候補を自動購入しない。

## Completion

次を満たして初めて完了:

1. 対象配信者/コンテンツを解決した。
2. current live / archive / scheduleを区別した。
3. 現在アカウントでの視聴可否・追加支払い要否を区別した。
4. 録画要求時はpersistent Firefox sessionを再利用した。
5. local fileが作成された。
6. ffprobeで映像/音声を確認した。
7. signed/tokenized media URLをGitHubへ残していない。
