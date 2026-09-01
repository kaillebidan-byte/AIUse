# RPLAY access presentation policy

`rplay-discovery.md` のaccess preflight結果を、ユーザーへ候補提示するときにどう扱うかを固定する補助policy。

## Four-way presentation

内部の `access_class` / `viewable_now` / `additional_payment_required_for_current_account` を、そのまま列挙せず次の4段階へ畳む。

1. **即閲覧可**
   - `viewable_now=true`
   - `public`
   - `login_viewable`
   - `paid_entitled`（既に権利を持っており、新規課金不要）
   - 通常shortlistへ入れる。

2. **無料操作で閲覧可**
   - `free_subscription` など、追加課金は不要だが無料フォロー/無料購読/free join等の0円操作が必要なもの。
   - `viewable_now=false` でも通常shortlistから除外しない。
   - 候補提示時は「無料フォロー/無料購読必要・課金不要」のように明示する。
   - RPLAY metadataがfollowとfree subscriptionを区別できない場合、exact actionを推測せず「無料操作必要」と表現する。

3. **追加課金必要**
   - `paid_required`
   - `additional_payment_required_for_current_account=true`
   - 通常shortlistから除外する。必要なら有料候補の別枠としてだけ提示する。

4. **閲覧不能 / gate不明**
   - DRM
   - authenticated `viewable_now=false` かつfree/paid根拠なし
   - private/region/other unknown gate
   - 通常shortlistから除外する。
   - gate不明を勝手に「有料」と断定しない。

## Free-action execution policy

無料フォロー/無料購読/free joinは、**Discovery中に大量・一括で自動実行しない**。

- Discoveryでは無料操作が必要な候補も通常候補に残す。
- ユーザーが候補を選び、その候補の閲覧/保存に無料操作が必要になった時点で実行対象にする。
- 金銭課金と無料フォローを同じ扱いにしない。課金は別境界。
- RPLAY探索量が増えて無料フォロー操作が常態化した場合にだけ、無制限/一括自動フォローを別contractとして再検討する。
- 現時点ではbulk auto-followを採用しない。

## Example

2026-09-02に確認した `https://rplay.live/play/6a4d16f0f57701ffe5b97fe8` は `free_subscription`、追加課金不要、通常shortlist対象として扱えた。この種別を「今すぐpublicではない」という理由だけで候補から落とさない。

## Shortlist rule

通常候補は次の順で扱う。

```text
即閲覧可
  ↓
無料操作で閲覧可
  ↓
--- 通常候補の境界 ---
追加課金必要
閲覧不能 / gate不明
```

意味的な関連度が高ければ「無料操作で閲覧可」をpublic候補より上に置いてよい。access classは内容 relevance を上書きするランキングではなく、**課金・操作コストの表示と除外境界**として使う。
