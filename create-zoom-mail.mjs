#!/usr/bin/env node
/**
 * Zoom URL共有メールを Gmail API で下書き作成（既定）／送信（--send）。
 *
 * 認証ファイル:
 *   credentials/credentials.json … OAuth Desktop クライアント
 *   credentials/token.json … 初回認可後に自動保存
 *
 * 使い方:
 *   node create-zoom-mail.mjs              # 下書き作成
 *   node create-zoom-mail.mjs --dry-run    # 内容確認のみ
 *   node create-zoom-mail.mjs --test       # テスト宛先用の下書き
 *   node create-zoom-mail.mjs --send       # 送信（確認後のみ）
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { google } from 'googleapis';
import {
  BODY,
  CC,
  FROM,
  SUBJECT,
  TO,
} from './zoom_mail_payload.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CRED_DIR = join(ROOT, 'credentials');
const CREDENTIALS_FILE = join(CRED_DIR, 'credentials.json');
const TOKEN_FILE = join(CRED_DIR, 'token.json');

const SCOPES_DRAFT = ['https://www.googleapis.com/auth/gmail.compose'];
const SCOPES_SEND = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith('--') ? argv[++i] : 'true';
    }
  }
  return args;
}

function buildRawMessage({ to, subject, body, cc, from = FROM }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function authorize(scopes) {
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

  const oAuth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    'http://127.0.0.1:53682'
  );

  if (existsSync(TOKEN_FILE)) {
    oAuth2Client.setCredentials(JSON.parse(readFileSync(TOKEN_FILE, 'utf8')));
    try {
      if (oAuth2Client.isTokenExpiring?.() || !oAuth2Client.credentials.access_token) {
        const { credentials } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(credentials);
        writeFileSync(TOKEN_FILE, JSON.stringify(credentials, null, 2));
      }
      return oAuth2Client;
    } catch {
      // fall through to interactive auth
    }
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  const code = await getAuthCode(authUrl);
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  mkdirSync(CRED_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  return oAuth2Client;
}

function getAuthCode(authUrl) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:53682');
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('認証完了です。このタブを閉じてターミナルに戻ってください。');
        server.close();
        if (code) resolve(code);
        else reject(new Error('認可コードがありません'));
      } catch (e) {
        reject(e);
      }
    });
    server.listen(53682, '127.0.0.1', () => {
      console.log('ブラウザで認可してください:\n' + authUrl);
      import('node:child_process').then(({ exec }) => {
        exec(`open "${authUrl}"`);
      });
    });
    // フォールバック: 手動入力
    setTimeout(() => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question('ブラウザが開かない場合、認可コードを貼ってください: ', (code) => {
        rl.close();
        try { server.close(); } catch {}
        resolve(code.trim());
      });
    }, 60000);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  let to = args.to || TO;
  let cc = args.cc !== undefined ? args.cc : CC;
  let subject = args.subject || SUBJECT;
  let body = BODY;

  if (args.test) {
    to = 'pharnewton@gmail.com';
    cc = '';
    subject = `[TEST] ${subject}`;
    body =
      `【テスト送信】本番予定の宛先:\nTo: ${TO}\nCC: ${CC}\nFrom: ${FROM}\n----------\n\n` +
      BODY;
  }

  console.log('=== メール内容 ===');
  console.log(`From: ${FROM}`);
  console.log(`To:   ${to}`);
  console.log(`CC:   ${cc || '(なし)'}`);
  console.log(`Subj: ${subject}`);
  console.log('--- body ---');
  console.log(body);
  console.log('==============');

  if (args['dry-run'] || args.dryrun) {
    console.log('dry-run: API は呼び出していません。');
    return;
  }

  const scopes = args.send ? SCOPES_SEND : SCOPES_DRAFT;
  const auth = await authorize(scopes);
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawMessage({ to, subject, body, cc: cc || undefined });
  const message = { raw };
  if (args['thread-id']) message.threadId = args['thread-id'];

  if (args.send) {
    const result = await gmail.users.messages.send({ userId: 'me', requestBody: message });
    console.log(`送信完了: id=${result.data.id} threadId=${result.data.threadId}`);
  } else {
    const result = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message },
    });
    console.log(
      `下書き作成完了: draftId=${result.data.id} messageId=${result.data.message?.id}`
    );
    console.log('Gmail の下書きを開き、宛先・CC・Zoom URL・ID・パスコードを確認してください。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
