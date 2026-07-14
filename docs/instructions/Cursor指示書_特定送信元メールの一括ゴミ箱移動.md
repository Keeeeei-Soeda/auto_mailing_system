# Cursor 指示書：特定送信元メールの一括ゴミ箱移動

## 目的
指定した送信元ドメインから届いたメールを、Gmail 上でまとめて**ゴミ箱（Trash）へ移動**する。完全削除は行わない（ゴミ箱は30日間、復元可能）。

## 対象
- 送信元ドメイン：
  - `nikkeibp.co.jp`（日経メディカル / 日経DI / 日経ヘルスケア等のニュースレター）
  - `media-radar.jp`（広告資料メール）
- Gmail 検索クエリ：`from:nikkeibp.co.jp OR from:media-radar.jp`
- 件数の目安：合計400件以上（各ドメイン200件以上）

## 実装方針
- Python で Gmail API を用いる。対象アカウントは `k.soeda@medi-canvas.com`。
- 認証スコープは `https://www.googleapis.com/auth/gmail.modify`（ゴミ箱移動に必要）。既存の OAuth クライアント／トークンを再利用し、スコープ不足の場合は再認可する。
- 処理フロー：
  1. `users.messages.list` に上記クエリを渡し、`nextPageToken` を辿って対象メッセージIDを全件収集する。
  2. `users.messages.batchModify` で `addLabelIds: ["TRASH"]`、`removeLabelIds: ["INBOX", "UNREAD"]` を指定し、**最大1000件ずつ**バッチでゴミ箱へ移動する。
- **既定は dry-run とすること。** まず対象件数と送信元別内訳のみを表示し、実際の移動は行わない。`--exec` フラグ指定時のみ実際にゴミ箱へ移動する。
- **完全削除（`messages.batchDelete` / `messages.delete`）は使用しないこと。** 復元不可のため、本タスクの範囲外とする。

## 実行手順
1. スクリプトを dry-run で実行し、対象件数（ドメイン別）を確認する。
2. 件数が想定どおりであることを確認する。
3. `--exec` を付けて実行し、対象メールをゴミ箱へ移動する。
4. Gmail のゴミ箱で移動結果を確認する。受信トレイに対象送信元が残っていないことを確認する。

## 完了条件
- `from:nikkeibp.co.jp OR from:media-radar.jp` に該当するメールが受信トレイに残っていない。
- 該当メールが Gmail のゴミ箱に移動している（30日以内は復元可能）。

## 注意点・補足
- 実行前の dry-run を必ず挟むこと。クエリの誤りで意図しないメールを移動しないため。
- 今後も同送信元が届き続けるため、恒久対応として Gmail のフィルタ（条件：`from:(nikkeibp.co.jp OR media-radar.jp)` → 受信トレイをスキップして削除）を別途設定すると、以降は自動でゴミ箱に振り分けられる。必要ならこのフィルタ作成もスクリプト化できる。
- 送信元を追加・変更する場合は、検索クエリの `from:` 部分を編集するだけで流用できる。
