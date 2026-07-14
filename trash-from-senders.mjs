#!/usr/bin/env node
/**
 * 指定送信元ドメインのメールを Gmail ゴミ箱へ一括移動する。
 *
 * 既定は dry-run（件数・ドメイン別内訳のみ表示）。
 * 実際の移動は --exec 指定時のみ。完全削除は行わない。
 *
 * 認証:
 *   credentials/credentials.json … OAuth クライアント
 *   credentials/token.json … 初回認可後に自動保存
 *
 * スコープ: https://www.googleapis.com/auth/gmail.modify
 *
 * 使い方:
 *   node trash-from-senders.mjs           # dry-run
 *   node trash-from-senders.mjs --exec    # 実際にゴミ箱へ移動
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { google } from 'googleapis';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CRED_DIR = join(ROOT, 'credentials');
const CREDENTIALS_FILE = join(CRED_DIR, 'credentials.json');
const TOKEN_FILE = join(CRED_DIR, 'token.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const DEFAULT_QUERY = 'from:nikkeibp.co.jp OR from:media-radar.jp';
const DOMAIN_KEYS = ['nikkeibp.co.jp', 'media-radar.jp'];
const BATCH_SIZE = 1000;
const LIST_PAGE_SIZE = 500;
// credentials.json が web クライアントの場合は登録済み redirect を優先
function resolveRedirect(cfg) {
  const uris = cfg.redirect_uris || [];
  const preferred = uris.find((u) => /localhost|127\.0\.0\.1/.test(u));
  return preferred || 'http://127.0.0.1:53682';
}

function parseArgs(argv) {
  const args = { exec: false, query: DEFAULT_QUERY };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exec') args.exec = true;
    else if (a === '--query' && argv[i + 1]) args.query = argv[++i];
  }
  return args;
}

async function authorize() {
  if (!existsSync(CREDENTIALS_FILE)) {
    console.error(
      `OAuth クライアントが見つかりません: ${CREDENTIALS_FILE}\n` +
        'Google Cloud Console で Desktop アプリの OAuth クライアント JSON を\n' +
        'credentials/credentials.json として配置してください。'
    );
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'));
  const cfg = raw.installed || raw.web;
  if (!cfg) {
    console.error('credentials.json に installed / web クライアント情報がありません');
    process.exit(2);
  }

  const redirectUri = resolveRedirect(cfg);
  const oAuth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    redirectUri
  );
  oAuth2Client.__redirectUri = redirectUri;

  if (existsSync(TOKEN_FILE)) {
    const tokens = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    oAuth2Client.setCredentials(tokens);
    const granted = new Set(tokens.scope ? tokens.scope.split(/\s+/) : []);
    const needScope = SCOPES.some((s) => !granted.has(s));
    if (!needScope) {
      try {
        const { credentials } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(credentials);
        writeFileSync(TOKEN_FILE, JSON.stringify(credentials, null, 2));
        return oAuth2Client;
      } catch {
        // fall through
      }
    }
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'select_account consent',
    login_hint: 'k.soeda@medi-canvas.com',
  });

  const code = await getAuthCode(authUrl, oAuth2Client.__redirectUri);
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  mkdirSync(CRED_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log('認可完了。token.json を更新しました。');
  return oAuth2Client;
}

function getAuthCode(authUrl, redirectUri) {
  const listenUrl = new URL(redirectUri);
  const host = listenUrl.hostname === 'localhost' ? '127.0.0.1' : listenUrl.hostname;
  const port = Number(listenUrl.port || (listenUrl.protocol === 'https:' ? 443 : 80));

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        if (err) {
          res.end(`認可エラー: ${err}\nこのウィンドウを閉じてください。`);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.end('code がありません。');
          return;
        }
        res.end('認可成功。このウィンドウを閉じてターミナルに戻ってください。');
        server.close();
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });

    server.listen(port, host, () => {
      console.log(`\n認可コールバック待機: ${redirectUri}`);
      console.log('ブラウザで Google 認可を開きます...');
      console.log(authUrl);
      const open =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      execFile(open, [authUrl], () => {});
      console.log(
        '\nブラウザが開かない場合は上記 URL を開いてください。\n' +
          '（または、リダイレクト後の URL から code= を手動入力）\n'
      );
    });

    server.on('error', (e) => {
      console.error(
        `ローカルサーバー起動失敗 (${host}:${port}): ${e.message}\n` +
          '別プロセスがポートを使用しているか、redirect URI を確認してください。'
      );
      reject(e);
    });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('認可コードを貼り付け（自動取得した場合は Enter のみ）: ', (line) => {
      rl.close();
      const trimmed = line.trim();
      if (trimmed) {
        server.close();
        resolve(trimmed);
      }
    });
  });
}

async function listAllMessageIds(gmail, query) {
  const ids = [];
  let pageToken;
  do {
    const resp = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults: LIST_PAGE_SIZE,
    });
    for (const m of resp.data.messages || []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = resp.data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function countByDomain(gmail) {
  const result = {};
  for (const domain of DOMAIN_KEYS) {
    const ids = await listAllMessageIds(gmail, `from:${domain}`);
    result[domain] = ids.length;
  }
  return result;
}

async function batchTrash(gmail, messageIds) {
  let moved = 0;
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const chunk = messageIds.slice(i, i + BATCH_SIZE);
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: chunk,
        addLabelIds: ['TRASH'],
        removeLabelIds: ['INBOX', 'UNREAD'],
      },
    });
    moved += chunk.length;
    console.log(`  ゴミ箱へ移動: ${moved}/${messageIds.length}`);
  }
  return moved;
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.exec ? 'EXEC' : 'DRY-RUN';
  console.log(`=== 特定送信元メール → ゴミ箱移動 (${mode}) ===`);
  console.log(`クエリ: ${args.query}\n`);

  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress || '(unknown)';
  console.log(`認可アカウント: ${email}`);
  // medi-canvas は send-as / エイリアスとして受信している想定。
  // ログイン本体は k.soeda.mediforce@gmail.com でも可。
  const allowed = new Set([
    'k.soeda@medi-canvas.com',
    'k.soeda.mediforce@gmail.com',
  ]);
  if (!allowed.has(email.toLowerCase())) {
    console.error(
      `\n⚠ 想定外のアカウントです（想定: medi-canvas / mediforce）。\n` +
        'credentials/token.json を削除して再実行し、正しいアカウントで認可してください。'
    );
    process.exit(3);
  }
  console.log();

  console.log('対象メッセージを収集中...');
  const messageIds = await listAllMessageIds(gmail, args.query);
  console.log(`合計: ${messageIds.length} 件`);

  console.log('\nドメイン別内訳（各 from: クエリ）:');
  const byDomain = await countByDomain(gmail);
  for (const [domain, n] of Object.entries(byDomain)) {
    console.log(`  ${domain}: ${n} 件`);
  }

  if (!args.exec) {
    console.log(
      '\ndry-run: ゴミ箱への移動は行っていません。\n' +
        '実移動する場合は --exec を付けて再実行してください。'
    );
    return;
  }

  if (messageIds.length === 0) {
    console.log('\n対象メールはありません。完了。');
    return;
  }

  console.log(
    `\nゴミ箱へ移動を開始します（最大 ${BATCH_SIZE} 件/バッチ）...`
  );
  const moved = await batchTrash(gmail, messageIds);
  console.log(
    `\n完了: ${moved} 件をゴミ箱へ移動しました（完全削除はしていません）。`
  );

  console.log('\n移動後の残件数確認:');
  const remaining = await listAllMessageIds(gmail, args.query);
  const inboxQ = `(${args.query}) in:inbox`;
  const inboxRemaining = await listAllMessageIds(gmail, inboxQ);
  console.log(`  クエリ全体の残件（ゴミ箱含む可能性あり）: ${remaining.length} 件`);
  console.log(`  受信トレイ残件 (${inboxQ}): ${inboxRemaining.length} 件`);
  if (inboxRemaining.length > 0) {
    console.error('⚠ 受信トレイにまだ残っています。内容を確認してください。');
    process.exit(1);
  }
  console.log('受信トレイに対象メールは残っていません。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
