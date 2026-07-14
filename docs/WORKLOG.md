# 作業ログ

メール自動送信システムに対して実施した作業を、後から振り返れるように記録します。
新しい作業をしたら、日付ごとに追記してください。

---

## 2026-06-25

### この日のゴール

1. 患者会向けメールを Cursor から作成・送信できることを実運用で確認する
2. 送信ルールを文書化し、別チャットでも引き継げるようにする
3. GAS をログ記録版へ差し替え、送信のたびにスプレッドシートへ記録されるようにする
4. ドキュメント整理と GitHub への反映

### 実施内容

#### 1. メール送信の実運用（2通を本送信）

運用フロー（`docs/MAIL_RULES.md`）に従い、まずテストアドレス `pharnewton@gmail.com` へ送って内容確認 → OK後に本番宛先へ送信。

| 宛先（本番） | 件名 | 備考 |
|---|---|---|
| `fmtu-bunara@ymail.ne.jp` / `jfsa@email.jp`（岡本様） | ご面談のご依頼と新プロダクトのご説明 | 件名を当初案から変更。宛名の役職「副理事長 兼 …」を役職ごとに二段改行へ修正 |
| `jfsa@email.jp` / `taeko-k@sea.plala.or.jp`（久保田様） | 先日のお礼と、7月中旬の北海道訪問のご相談 | 宛名（団体名・役職・氏名）を空行なしの連続行へ修正 |

- この2通は **ログ記録版を導入する前** に送信したため、当時はスプレッドシートに記録されず（後日 `backfillLogs()` で追記）。

#### 2. 送信ルールブックの作成

- `docs/MAIL_RULES.md` を新規作成。
- 主な確定ルール：
  - 送信フローは「まず `pharnewton@gmail.com` にテスト → ユーザーの『送って／OK』後に本番送信」。
  - 宛名（団体名・役職・氏名）は **空行なしの連続行**。
  - 宛名の後・段落間・結びの後は1行空ける。署名（会社名・氏名）は空行なし連続。

#### 3. GAS をログ記録版へ差し替え

- `send_mail.gs` をログ記録版に更新（送信のたびに送信ログ用スプレッドシートへ1行追記）。
  - ログ先: スプレッドシート `1-YtRl59Noxzz70D4CQFmJT_IDydaGgnEEhk7bllNJas` の「送信ログ」シート。
  - ログ列: `送信日時 / 宛先 / 件名 / 本文 / CC / 差出人 / ステータス / 種別 / 備考`。
- `AUTH_TOKEN` を `.env` の `GAS_TOKEN` と同じ値に合わせた。
- GAS エディタへ貼り替え、「デプロイを管理」から **新バージョンとしてデプロイ**（手動）。

##### つまずき & 対処（時系列）

1. 新バージョンへの差し替え直後、送信は成功（`sent:true`）するが応答に `logged:true` が無い
   → exec URL に新バージョンが反映されていなかった。デプロイ対象のデプロイを正しく新バージョン化して解消。
2. 反映後、`SpreadsheetApp.openById` の **権限エラー**（Sheets スコープ未承認）
   → 承認用関数 `grantPermissions()` を追加し、GAS エディタで実行して権限を承認。
3. 再送信で応答に `logged:true` を確認し、送信ログへの追記成功を確認。

##### 動作確認に実際に流したコマンド（自分宛）

```bash
node send-mail.mjs --to "k.soeda@medi-canvas.com" --subject "送信ログ記録版 最終確認" --body "..."
# 応答: {"ok":true,"sent":true,"from":"k.soeda@medi-canvas.com","to":"k.soeda@medi-canvas.com","subject":"送信ログ記録版 最終確認","logged":true}
```

- ✅ `sent:true`（実送信）／✅ `logged:true`（ログ追記成功）。
- 検証過程で自分宛に複数通のテストメールを送信（不要分は削除可）。

#### 4. 大園様へメール送信

- `pharnewton@gmail.com`（株式会社でかみん 大園様）へ「明日のお打ち合わせのURLご送付のお願い」を送信。
- 応答に `logged:true` を確認（ログ記録版で正常に記録）。

#### 5. 過去送信分のログ追記

- ログ記録版導入前に送った岡本様・久保田様の2通を、後から送信ログへ記録するための関数 `backfillLogs()` を `send_mail.gs` に追加。
- GAS エディタで1回実行してログへ追記（メール送信はしない／ログ追記のみ）。

#### 6. ドキュメント整理・GitHub 反映

- `docs/` フォルダを作成し、`SETUP.md` / `MAIL_RULES.md` / `cursor_mail_setup.md` / `WORKLOG.md` を集約。
- `README.md` をプロジェクト概要・目次として整理。
- `Keeeeei-Soeda` アカウントで GitHub へプッシュ。

### 申し送り・注意

- `AUTH_TOKEN` / `GAS_TOKEN` の値が `openssl rand -hex 24`（トークン生成コマンドの文字列そのもの）になっている。動作はするが、セキュリティ上は正規のランダム値へ変更するのが望ましい（要対応の宿題）。
- `backfillLogs()` は重複実行すると同じ行が二重に追記されるため、実行は1回だけ。
- GAS のコードを変更して exec URL の挙動を変えたい場合は、保存に加えて **新バージョンでの再デプロイ** が必要。

---

## 2026-07-14

### この日のゴール

日本アラジール症候群の会（吉田さん）へ、7/15 Zoom URL 共有メールの下書きを作成する。

### 実施内容

1. 指示書どおりの宛先・件名・本文を `zoom_mail_payload.{py,mjs}` に定義。
2. Gmail API 下書き作成スクリプトを追加（`create-zoom-mail.mjs` / `create_zoom_mail.py`）。既定は下書き、`--send` で送信切替。
3. 内容検証テストを追加・実行（Node + Python unittest）→ **すべて合格**。
4. 既存 GAS 経路にも `draft=1` / `--draft` を追加（`send_mail.gs` / `send-mail.mjs`）。

### ブロッカー

- `.env` の `GAS_EXEC_URL` が **HTTP 404**（デプロイ無効化／URL変更の疑い）。既存 GAS 経由での送信・下書き不可。
- Gmail OAuth 用 `credentials/credentials.json` 未配置のため、Gmail API での下書き作成も未完了。

### 次アクション（ユーザー側）

A. GAS を再デプロイし、新しい exec URL を `.env` の `GAS_EXEC_URL` に反映する（`send_mail.gs` を貼り直し、`draft` 対応版にする）  
または  
B. `k.soeda@medi-canvas.com` 用 Desktop OAuth JSON を `credentials/credentials.json` に配置し、`node create-zoom-mail.mjs` で認可→下書き作成

### テスト結果

```
npm test → OK（Node assert + Python unittest 5件）
node create-zoom-mail.mjs --dry-run → 内容表示OK
node create-zoom-mail.mjs --test --dry-run → テスト宛先内容表示OK
```

### 特定送信元メールの一括ゴミ箱移動

- 対象クエリ: `from:nikkeibp.co.jp OR from:media-radar.jp`
- 認可アカウント: `k.soeda.mediforce@gmail.com`（`k.soeda@medi-canvas.com` は send-as / エイリアス受信）
- スクリプト: `trash-from-senders.mjs`（既定 dry-run / `--exec` で実移動）。Python 版も `trash_from_senders.py` あり（本機 Python の pyexpat 不具合のため Node で実行）
- Gmail API（project `kataduke-20260628`）を有効化して実行

| 段階 | 結果 |
|---|---|
| dry-run | 合計 1861 件（nikkeibp 314 / media-radar 1547） |
| `--exec` | 1861 件をゴミ箱へ移動（完全削除なし） |
| 事後確認 | 受信トレイ残件 0 |

恒久対応（任意）: Gmail フィルタで同クエリを「受信トレイをスキップして削除」にすると今後自動でゴミ箱へ振られる。
