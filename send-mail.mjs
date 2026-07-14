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

// 引数パース: --to --subject --body --cc --bcc --html --dry-run --draft
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
if (args.draft) params.set('draft', '1');

const url = `${EXEC_URL}?${params.toString()}`;
const res = await fetch(url, { redirect: 'follow' });
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
