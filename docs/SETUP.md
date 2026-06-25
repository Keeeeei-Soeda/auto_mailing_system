# メール自動送信システム セットアップ記録

Cursorのチャットでメール文面を決めて、`k.soeda@medi-canvas.com` 名義で自動送信する仕組みのセットアップ記録です。
（元の手順書: `cursor_mail_setup.md`）

---

## 1. 構成概要

```
Cursor (チャットで文面決定)
        │  node send-mail.mjs --to ... --subject ... --body ...
        ▼
send-mail.mjs  ──GETリクエスト（token/to/subject/body...）──▶  GAS Webアプリ (send_mail.gs)
        ▲                                                              │
        │                                                       GmailApp.sendEmail
     .env                                                              ▼
 (URL・トークン)                                      k.soeda@medi-canvas.com 名義で送信
```

- **送信元**: `k.soeda@medi-canvas.com` 固定（GAS側 `DEFAULT_FROM`、send-as エイリアス）
- **認証**: `.env` の `GAS_TOKEN` と GAS側 `AUTH_TOKEN` の一致でチェック

---

## 2. ファイル構成

| ファイル | 役割 | Git管理 |
|---|---|---|
| `send-mail.mjs` | メール送信用CLIスクリプト（Node.js、依存なし） | する |
| `.env` | `GAS_EXEC_URL` と `GAS_TOKEN` を保持 | **しない（.gitignore）** |
| `.gitignore` | `.env`・`node_modules/` を除外 | する |
| `send_mail.gs` | GAS側Webアプリ本体（参照用） | する |
| `cursor_mail_setup.md` | 元の手順書 | する |

### `.env` の形式

```
GAS_EXEC_URL=https://script.google.com/macros/s/AKfycbz.../exec
GAS_TOKEN=（GAS側 AUTH_TOKEN と同じ値）
```

> `.env` はトークンを含むため `.gitignore` で除外済み（`git check-ignore .env` で確認済み）。絶対にコミットしない。

---

## 3. 使い方

### スクリプト引数

| 引数 | 必須 | 説明 |
|---|---|---|
| `--to` | ✓ | 宛先（カンマ区切りで複数可） |
| `--subject` | ✓ | 件名 |
| `--body` | ✓ | 本文 |
| `--cc` | | CC |
| `--bcc` | | BCC |
| `--html` | | 本文をHTMLとして送信 |
| `--dry-run` | | 送信せず内容だけ返す（確認用） |

### コマンド例

```bash
# 確認（送信しない）
node send-mail.mjs --to "tanaka@elan.co.jp" --subject "打ち合わせ日程のご相談" --body "本文..." --dry-run

# 本送信
node send-mail.mjs --to "tanaka@elan.co.jp" --subject "打ち合わせ日程のご相談" --body "本文..."
```

---

## 4. 運用ルール（厳守）

1. 宛先・相手・用件を伝えたら、エージェントが件名と本文を整える
2. 送信前に必ず一度 `--dry-run` を付けて実行し、宛先・件名・本文を確認する
3. 「送って」「OK」と言うまで、`--dry-run` なしの実送信は絶対にしない
4. 実送信は取り消せないため、宛先のタイプミスは特に注意して確認する

---

## 5. テスト結果（2026-06-25 実施）

### 環境
- Node.js: v24.15.0（`fetch` 利用可）

### テスト① dryrun（送信なし）動作確認

**コマンド**
```bash
node send-mail.mjs --to "k.soeda@medi-canvas.com" --subject "テスト送信（dryrun）" --body "これはdryrunの動作確認です。実送信はされません。" --dry-run
```

**結果**: `HTTP 200`
```json
{"ok":true,"dryRun":true,"from":"k.soeda@medi-canvas.com","to":"k.soeda@medi-canvas.com","subject":"テスト送信（dryrun）","body":"これはdryrunの動作確認です。実送信はされません。","options":{"from":"k.soeda@medi-canvas.com"}}
```
- ✅ 接続・トークン認証OK
- ✅ `from` が `k.soeda@medi-canvas.com`

### テスト② 実送信（自分宛に1通）

**コマンド**
```bash
node send-mail.mjs --to "k.soeda@medi-canvas.com" --subject "テスト送信（実送信確認）" --body "これは実送信の動作確認テストです。"
```

**結果**: `HTTP 200`
```json
{"ok":true,"sent":true,"from":"k.soeda@medi-canvas.com","to":"k.soeda@medi-canvas.com","subject":"テスト送信（実送信確認）"}
```
- ✅ `sent: true`（実際に送信）
- ✅ 受信トレイに着信を確認
- ✅ 受信メールの送信元が `k.soeda@medi-canvas.com`

### 総合判定

**✅ セットアップ完了・本番運用可能**

---

## 6. トラブルシューティング

- `unauthorized` が返る → `.env` の `GAS_TOKEN` と GAS側 `AUTH_TOKEN` の不一致を疑う
- 送信元が想定と違う → GAS側の send-as エイリアス（medi-canvas.com）登録の有無を確認
- `GAS_EXEC_URL と GAS_TOKEN を .env に設定してください` → `.env` の値が空
