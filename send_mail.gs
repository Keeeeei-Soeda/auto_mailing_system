/**
 * 汎用メール送信 GAS（Claude発火対応・最終版）
 * web_fetch から exec URL を叩くと、渡した宛先・件名・本文でそのまま送信する。
 * 送信元は k.soeda@medi-canvas.com（母艦アカウントの send-as エイリアス）。
 *
 * パラメータ:
 *   token   … 認証トークン（必須）
 *   to      … 宛先。カンマ区切りで複数可（必須）
 *   subject … 件名（必須）
 *   body    … 本文（必須）
 *   cc      … CC（任意・カンマ区切り可）
 *   bcc     … BCC（任意・カンマ区切り可）
 *   from    … 差出人を個別に上書きしたい時のみ（任意・send-as登録済みのみ）
 *   html    … "1" なら body をHTMLとして送信（任意）
 *   dryrun  … "1" なら送信せず受け取った内容だけ返す（動作確認用）
 *
 * ※ URLパラメータは送信側でURLエンコードすること。
 */

// ===== 設定 =====
const AUTH_TOKEN = "ここを長いランダム文字列に置き換える"; // 例: openssl rand -hex 24
const DEFAULT_FROM = "k.soeda@medi-canvas.com"; // 既定の差出人（send-as登録済み）

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p.token !== AUTH_TOKEN) {
    return jsonOut({ ok: false, error: "unauthorized" });
  }

  const to = (p.to || "").trim();
  const subject = p.subject || "";
  const body = p.body || "";

  if (!to || !subject || !body) {
    return jsonOut({ ok: false, error: "to / subject / body は必須です" });
  }

  const options = {};
  const from = p.from || DEFAULT_FROM;
  if (from) options.from = from;
  if (p.cc) options.cc = p.cc.trim();
  if (p.bcc) options.bcc = p.bcc.trim();
  if (p.html === "1") options.htmlBody = body;

  // 動作確認モード：送信せず内容をそのまま返す
  if (p.dryrun === "1") {
    return jsonOut({ ok: true, dryRun: true, from: from, to, subject, body, options });
  }

  try {
    GmailApp.sendEmail(to, subject, body, options);
    return jsonOut({ ok: true, sent: true, from: from, to, subject });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
