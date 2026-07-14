# メール自動送信システム

Cursor のチャットでメール文面を決め、`k.soeda@medi-canvas.com` 名義で送信する仕組みです。
送信のたびに、送信ログ用スプレッドシートへ自動で1行記録されます。
**添付ファイル**・**CC**・**既存スレッドへの返信**にも対応しています。

```
Cursor (チャットで文面決定)
        │  python3 send-mail.py --to ... --subject ... --body ...
        │           [--cc ...] [--attach ...] [--thread-id ...]
        ▼
send-mail.py ──GET/POST──▶ GAS Webアプリ (send_mail.gs)
        ▲                              │
        │                    GmailApp.sendEmail / .reply
      .env                             │
 (URL・トークン)                  送信ログ(スプレッドシート)へ1行追記
```

（`send-mail.mjs` も同等機能あり。環境に Node が無い場合は Python 版を使う。）

---

## ファイル構成

| パス | 役割 |
|---|---|
| `send-mail.py` | メール送信用 CLI（推奨・Python） |
| `send-mail.mjs` | メール送信用 CLI（Node.js） |
| `send_mail.gs` | GAS 側 Web アプリ本体（参照・再デプロイ用） |
| `.env` | `GAS_EXEC_URL` と `GAS_TOKEN`（**Git管理しない**） |
| `attachments/` | 送信用添付（請求書 PDF など） |
| `docs/instructions/` | Cursor 指示書 |
| `docs/MAIL_RULES.md` | メール作成・送信ルール |
| `docs/SETUP.md` | セットアップ記録 |
| `docs/WORKLOG.md` | 作業ログ |
| `docs/archive/` | 未採用の試作コード |

---

## 使い方

```bash
# テスト（テストアドレスへ実送信）
python3 send-mail.py --to "pharnewton@gmail.com" --subject "件名" --body "本文..."

# 本送信（添付あり）
python3 send-mail.py \
  --to "宛先" \
  --subject "件名" \
  --body "本文..." \
  --attach "attachments/請求書_xxx.pdf"

# 本送信（CC・スレッド返信）
python3 send-mail.py \
  --to "宛先" \
  --cc "cc1@example.com,cc2@example.com" \
  --subject "Re: 件名" \
  --thread-id "19f605da3923d395" \
  --body "本文..."
```

| 引数 | 必須 | 説明 |
|---|---|---|
| `--to` | ✓ | 宛先（カンマ区切りで複数可） |
| `--subject` | ✓ | 件名 |
| `--body` | ✓ | 本文 |
| `--cc` / `--bcc` | | CC / BCC |
| `--attach` | | 添付ファイルパス（PDF 等） |
| `--thread-id` | | 既存 Gmail スレッドへの返信 |
| `--mode` | | `send`（既定）または `draft` |
| `--html` | | 本文を HTML として送信 |
| `--dry-run` | | 送信せず内容だけ返す（ログも残さない） |

---

## 運用ルール（要点）

1. 宛先・相手・用件を伝えると、エージェントが件名・本文を整える。
2. **まずテストアドレス `pharnewton@gmail.com` へ送って内容確認** → 「送って／OK」後に本番宛先へ送信。
3. 宛名（団体名・役職・氏名）は空行なしの連続行。
4. 実送信は取り消せないため、宛先のタイプミスに特に注意する。
5. GAS を変えたら **新バージョンで再デプロイ**し、必要なら `.env` の exec URL を更新。

詳細は [`docs/MAIL_RULES.md`](docs/MAIL_RULES.md) を参照。

---

## 送信ログ

- 送信成功・失敗ともに、スプレッドシート `1-YtRl59Noxzz70D4CQFmJT_IDydaGgnEEhk7bllNJas` の「送信ログ」シートへ追記されます。
- 応答 JSON に `"logged": true` が含まれていれば、ログ追記まで成功しています。
- スレッド返信時は `"reply": true` と `threadId` も返ります。

---

## 新しいチャットを始めるとき

ルールと経緯を引き継ぐため、冒頭で次のファイルを読むよう指示してください。

- [`docs/MAIL_RULES.md`](docs/MAIL_RULES.md)（送信ルール）
- [`docs/SETUP.md`](docs/SETUP.md)（構成・セットアップ）
- [`docs/WORKLOG.md`](docs/WORKLOG.md)（これまでの作業）
- [`docs/instructions/`](docs/instructions/)（個別の Cursor 指示書）
