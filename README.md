# メール自動送信システム

Cursor のチャットでメール文面を決め、`k.soeda@medi-canvas.com` 名義で送信する仕組みです。
送信のたびに、送信ログ用スプレッドシートへ自動で1行記録されます。

```
Cursor (チャットで文面決定)
        │  node send-mail.mjs --to ... --subject ... --body ...
        ▼
send-mail.mjs ──GETリクエスト──▶ GAS Webアプリ (send_mail.gs)
        ▲                              │
        │                       GmailApp.sendEmail → 送信
      .env                             │
 (URL・トークン)                  送信ログ(スプレッドシート)へ1行追記
```

---

## ファイル構成

| パス | 役割 |
|---|---|
| `send-mail.mjs` | メール送信用 CLI（Node.js、依存なし） |
| `send_mail.gs` | GAS 側 Web アプリ本体（ログ記録版・参照用） |
| `.env` | `GAS_EXEC_URL` と `GAS_TOKEN`（**Git管理しない**） |
| `.gitignore` | `.env`・`node_modules/` を除外 |
| `docs/SETUP.md` | セットアップ記録・テスト結果 |
| `docs/MAIL_RULES.md` | メール作成・送信時のルールブック |
| `docs/WORKLOG.md` | 作業ログ（実施内容の記録） |
| `docs/cursor_mail_setup.md` | 元の手順書（初期セットアップ用） |

---

## 使い方

```bash
# 確認（送信しない）
node send-mail.mjs --to "宛先" --subject "件名" --body "本文..." --dry-run

# 本送信
node send-mail.mjs --to "宛先1,宛先2" --subject "件名" --body "本文..."
```

| 引数 | 必須 | 説明 |
|---|---|---|
| `--to` | ✓ | 宛先（カンマ区切りで複数可） |
| `--subject` | ✓ | 件名 |
| `--body` | ✓ | 本文 |
| `--cc` / `--bcc` | | CC / BCC |
| `--html` | | 本文を HTML として送信 |
| `--dry-run` | | 送信せず内容だけ返す（ログも残さない） |

---

## 運用ルール（要点）

1. 宛先・相手・用件を伝えると、エージェントが件名・本文を整える。
2. **まずテストアドレス `pharnewton@gmail.com` へ送って内容確認** → 「送って／OK」後に本番宛先へ送信。
3. 宛名（団体名・役職・氏名）は空行なしの連続行。
4. 実送信は取り消せないため、宛先のタイプミスに特に注意する。

詳細は [`docs/MAIL_RULES.md`](docs/MAIL_RULES.md) を参照。

---

## 送信ログ

- 送信成功・失敗ともに、スプレッドシート `1-YtRl59Noxzz70D4CQFmJT_IDydaGgnEEhk7bllNJas` の「送信ログ」シートへ追記されます。
- 応答 JSON に `"logged": true` が含まれていれば、ログ追記まで成功しています。

---

## 新しいチャットを始めるとき

ルールと経緯を引き継ぐため、冒頭で次のファイルを読むよう指示してください。

- [`docs/MAIL_RULES.md`](docs/MAIL_RULES.md)（送信ルール）
- [`docs/SETUP.md`](docs/SETUP.md)（構成・セットアップ）
- [`docs/WORKLOG.md`](docs/WORKLOG.md)（これまでの作業）
