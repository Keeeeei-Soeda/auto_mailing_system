# Cursor用：チャットでメール文面を決めて自動送信する仕組み

すでにGAS（Google Apps Script）のWebアプリをデプロイ済みで、`token / to / subject / body` を渡すと
`k.soeda@medi-canvas.com` 名義でメールを送信できる状態。
これをCursorから叩けるようにして、「文面をチャットで決める → 送信」を完結させる。

---

## ① 最初にCursorのエージェントへ貼る指示文（セットアップ）

> 以下をそのままCursorのagentチャットに貼ってください。

```
このプロジェクトに、メール送信用の仕組みをセットアップして。

すでにGAS Webアプリをデプロイ済みで、以下のexec URLに GETパラメータ
（token, to, subject, body, cc, bcc, html, dryrun）を渡すとメールが送信される。
送信元は k.soeda@medi-canvas.com 固定。

やってほしいこと：

1. プロジェクト直下に `send-mail.mjs` を作成（中身は下記のとおり、そのまま）
2. `.env` を作成し、GAS_EXEC_URL と GAS_TOKEN を記入できるようにする（値はこちらで埋める）
3. `.gitignore` に `.env` を追加（トークンを絶対にコミットしない）
4. 動作確認として、まず dryrun（送信しない）で自分宛にテスト実行し、
   返ってきたJSONの "from" が k.soeda@medi-canvas.com になっているか確認して報告

--- send-mail.mjs の中身 ---

import { readFileSync } from 'node:fs';

// .env を読む（依存なしの簡易ローダー）
try {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const EXEC_URL = process.env.GAS_EXEC_URL;
const TOKEN = process.env.GAS_TOKEN;
if (!EXEC_URL || !TOKEN) {
  console.error('GAS_EXEC_URL と GAS_TOKEN を .env に設定してください');
  process.exit(1);
}

// 引数パース: --to --subject --body --cc --bcc --html --dry-run
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    args[key] = (next && !next.startsWith('--')) ? process.argv[++i] : 'true';
  }
}

const { to, subject, body, cc, bcc } = args;
if (!to || !subject || !body) {
  console.error('必須引数: --to --subject --body');
  process.exit(1);
}

const params = new URLSearchParams({ token: TOKEN, to, subject, body });
if (cc) params.set('cc', cc);
if (bcc) params.set('bcc', bcc);
if (args.html) params.set('html', '1');
if (args['dry-run'] || args.dryrun) params.set('dryrun', '1');

const url = `${EXEC_URL}?${params.toString()}`;
const res = await fetch(url, { redirect: 'follow' });
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);

--- ここまで ---

.env の中身は以下の形（値は私が後で入れる）：

GAS_EXEC_URL=https://script.google.com/macros/s/AKfycbzxcYEdgc928gtU9KGcw-mYE-5rduySJ86qWfIKWfVsQ959WVV4UusrIZJQwxus22Sg/exec
GAS_TOKEN=

セットアップ後の運用ルール（重要・必ず守って）：
- 私がメールの宛先・相手・用件を伝えたら、あなたが件名と本文を整える
- 送信前に必ず一度 `--dry-run` を付けて実行し、宛先・件名・本文を私に見せて確認を取る
- 私が「送って」「OK」と言うまで、--dry-run なしの実送信は絶対にしない
- 実送信は取り消せないので、宛先のタイプミスは特に注意して確認すること
```

---

## ② セットアップ後、`.env` にトークンを記入

`send-mail.mjs` と `.env` ができたら、`.env` の `GAS_TOKEN=` の右に、
GASに設定した認証トークン（`AUTH_TOKEN` の値）を貼る。
`GAS_EXEC_URL` は上記で埋まっているはず。

---

## ③ 日々の使い方（Cursorのエージェントに頼む）

例：

```
エラン田中さん（tanaka@elan.co.jp）に、来週の打ち合わせ日程を確認するメールを送りたい。
候補は火曜午後か水曜午前。丁寧めのビジネス文面で。
```

→ エージェントが件名・本文を整える
→ まず `--dry-run` で実行して内容を見せてくる
→ あなたがOKを出す
→ `--dry-run` を外して実送信（k.soeda@medi-canvas.com から飛ぶ）

手動でコマンドを打ちたい場合：

```bash
# 確認（送信しない）
node send-mail.mjs --to "tanaka@elan.co.jp" --subject "打ち合わせ日程のご相談" --body "本文..." --dry-run

# 本送信
node send-mail.mjs --to "tanaka@elan.co.jp" --subject "打ち合わせ日程のご相談" --body "本文..."
```

---

## チェックポイント

- 最初の dryrun で返るJSONの `"from"` が `k.soeda@medi-canvas.com` か
- 続けて dryrun を外し、自分宛に1通テスト送信 → 受信側の送信元ヘッダを確認
- 問題なければ本番の宛先で運用開始

※ うまく送信されない場合、GAS側の send-as エイリアス（medi-canvas.com）登録の有無、
　 またはトークン不一致（unauthorized）をまず疑う。
