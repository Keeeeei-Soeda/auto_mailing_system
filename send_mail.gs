/**
 * 汎用メール送信 GAS（Claude発火対応・ログ記録版・添付対応）
 * GET: 従来どおり URL パラメータで送信（添付なし）
 * POST: JSON ボディで送信（Base64 添付対応）
 * 送信元は k.soeda@medi-canvas.com（母艦アカウントの send-as エイリアス）。
 *
 * 共通パラメータ:
 *   token   … 認証トークン（必須）
 *   to      … 宛先。カンマ区切りで複数可（必須）
 *   subject … 件名（必須）
 *   body    … 本文（必須）
 *   cc      … CC（任意・カンマ区切り可）
 *   bcc     … BCC（任意・カンマ区切り可）
 *   from    … 差出人を個別に上書きしたい時のみ（任意・send-as登録済みのみ）
 *   html    … "1" なら body をHTMLとして送信（任意）
 *   kind    … 種別タグ（任意）
 *   dryrun  … "1" なら送信せず受け取った内容だけ返す（ログも残さない）
 *   mode     … "send"（既定）または "draft"（下書き作成）
 *   draft    … "1" なら mode=draft と同じ（後方互換）
 *   threadId … 指定時は既存スレッドへの返信（GmailApp.getThreadById）
 *
 * POST 追加:
 *   attachmentName     … 添付ファイル名（例: invoice.pdf）
 *   attachmentMimeType … MIME（省略時 application/pdf）
 *   attachmentBase64   … 添付の Base64 文字列
 */

// ===== 設定 =====
const AUTH_TOKEN = "openssl rand -hex 24"; // .env の GAS_TOKEN と同じ値にすること
const DEFAULT_FROM = "k.soeda@medi-canvas.com"; // 既定の差出人（send-as登録済み）
const LOG_SPREADSHEET_ID = "1-YtRl59Noxzz70D4CQFmJT_IDydaGgnEEhk7bllNJas"; // 送信ログ用スプレッドシート
const LOG_SHEET_NAME = "送信ログ"; // 無ければ自動作成

// ログのヘッダー（初回のみ自動生成）
const LOG_HEADERS = ["送信日時", "宛先", "件名", "本文", "CC", "差出人", "ステータス", "種別", "備考"];

/**
 * 権限承認用：GASエディタでこの関数を1回実行し、
 * 表示される権限ダイアログでスプレッドシート(Sheets)へのアクセスを許可する。
 */
function grantPermissions() {
  const ss = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  Logger.log("OK: シート「%s」にアクセスできました", sheet.getName());
}

/**
 * 過去送信分の追記用（重複実行注意）。
 */
function backfillLogs() {
  const rows = [
    {
      date: new Date(2026, 5, 25, 15, 24, 0),
      to: "fmtu-bunara@ymail.ne.jp,jfsa@email.jp",
      subject: "ご面談のご依頼と新プロダクトのご説明",
      body: [
        "NPO法人線維筋痛症友の会",
        "",
        "副理事長",
        "",
        "中部・奈良支部 支部長",
        "",
        "岡本様",
        "",
        "いつもお世話になっております。",
        "",
        "株式会社メディキャンバスの副田です。",
        "先日はお忙しい中、貴重なお時間をいただき、誠にありがとうございました。その際に伺った患者さんの声を踏まえ、このたび線維筋痛症の患者さんに向けた新しいプロダクトが形になりましたので、ご連絡を差し上げました。",
        "",
        "つきましては、一度オンラインでお時間を頂戴し、どのようなものか直接ご説明させていただけないかと考えております。その上で、患者さんやご家族の視点から、忌憚のないフィードバックをいただけますと大変ありがたく存じます。実際に支援に携わっていらっしゃる皆さまのご意見が、より患者さんの役に立つものへ磨いていくうえで欠かせないと考えております。",
        "",
        "ご多忙のことと存じますが、もしご関心をお持ちいただけましたら、ご都合のよい日程をいくつかお知らせいただけますでしょうか。30分〜1時間ほどを想定しており、オンライン会議のURLはこちらでご用意いたします。",
        "",
        "何卒よろしくお願い申し上げます。",
        "",
        "株式会社メディキャンバス",
        "代表取締役　副田　渓",
      ].join("\n"),
    },
    {
      date: new Date(2026, 5, 25, 15, 46, 0),
      to: "jfsa@email.jp,taeko-k@sea.plala.or.jp",
      subject: "先日のお礼と、7月中旬の北海道訪問のご相談",
      body: [
        "NPO法人線維筋痛症友の会",
        "理事長 兼 北海道支部 支部長",
        "久保田様",
        "",
        "いつもお世話になっております。",
        "",
        "株式会社メディキャンバスの副田です。",
        "先日はお忙しい中、貴重なお時間をいただき、誠にありがとうございました。直接お話を伺うことができ、大変勉強になりましたとともに、今後の取り組みへの励みとなりました。",
        "",
        "さて、このたび来月7月の中旬ごろに北海道へ伺う予定がございまして、ご連絡を差し上げました。もし久保田様のご都合が合いましたら、ぜひ再度お目にかかり、お話をさせていただければと考えております。日程としては7月14日から20日のあたりで調整しておりますので、この期間でご都合のよい日時がございましたら、お知らせいただけますと幸いです。",
        "",
        "ご多忙のことと存じますので、もしお時間が難しいようでしたら、どうぞお気になさらないでください。",
        "",
        "引き続き、何卒よろしくお願い申し上げます。",
        "",
        "株式会社メディキャンバス",
        "代表取締役　副田　渓",
      ].join("\n"),
    },
  ];

  const ss = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  rows.forEach(function (r) {
    sheet.appendRow([
      r.date,
      r.to,
      r.subject,
      r.body,
      "",
      DEFAULT_FROM,
      "送信成功",
      "患者会アウトリーチ",
      "ログ記録版導入前の送信を後から記録",
    ]);
  });

  Logger.log("OK: 過去送信分 %s 件を送信ログに追記しました", rows.length);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  return handleMailRequest_(p, null);
}

/**
 * 添付付き送信用。CLI からは JSON POST する。
 */
function doPost(e) {
  let p = {};
  try {
    if (e && e.postData && e.postData.contents) {
      p = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: "invalid JSON: " + String(err) });
  }
  // URL クエリもマージ（token をクエリで渡す用途）
  const q = (e && e.parameter) || {};
  Object.keys(q).forEach(function (k) {
    if (p[k] === undefined || p[k] === "") p[k] = q[k];
  });
  return handleMailRequest_(p, {
    name: p.attachmentName || "",
    mimeType: p.attachmentMimeType || "application/pdf",
    base64: p.attachmentBase64 || "",
  });
}

function handleMailRequest_(p, attachment) {
  if (p.token !== AUTH_TOKEN) {
    return jsonOut({ ok: false, error: "unauthorized" });
  }

  const to = String(p.to || "").trim();
  const subject = p.subject || "";
  const body = p.body || "";

  if (!to || !subject || !body) {
    return jsonOut({ ok: false, error: "to / subject / body は必須です" });
  }

  const options = {};
  const from = p.from || DEFAULT_FROM;
  if (from) options.from = from;
  if (p.cc) options.cc = String(p.cc).trim();
  if (p.bcc) options.bcc = String(p.bcc).trim();
  if (p.html === "1" || p.html === true) options.htmlBody = body;

  const kind = p.kind || "";
  let mode = (p.mode || "send").toLowerCase();
  if (p.draft === "1" || p.draft === true) mode = "draft";
  const threadId = String(p.threadId || "").trim();
  const hasAttachment = !!(attachment && attachment.base64);

  if (hasAttachment) {
    try {
      const bytes = Utilities.base64Decode(attachment.base64);
      const blob = Utilities.newBlob(
        bytes,
        attachment.mimeType || "application/pdf",
        attachment.name || "attachment.pdf"
      );
      options.attachments = [blob];
    } catch (err) {
      return jsonOut({ ok: false, error: "attachment decode failed: " + String(err) });
    }
  }

  // 動作確認モード：送信もログ記録もしない
  if (p.dryrun === "1" || p.dryrun === true) {
    return jsonOut({
      ok: true,
      dryRun: true,
      from: from,
      to: to,
      subject: subject,
      body: body,
      mode: mode,
      threadId: threadId || null,
      hasAttachment: hasAttachment,
      attachmentName: hasAttachment ? attachment.name : null,
      kind: kind,
    });
  }

  let note = hasAttachment ? "添付: " + (attachment.name || "(unnamed)") : "";
  if (threadId) {
    note = (note ? note + " / " : "") + "threadId: " + threadId;
  }

  try {
    if (threadId) {
      const thread = GmailApp.getThreadById(threadId);
      if (!thread) {
        return jsonOut({ ok: false, error: "thread not found: " + threadId });
      }
      if (mode === "draft") {
        // createDraftReply は options 非対応のため本文のみ
        thread.createDraftReply(body);
        logRow_(to, subject, body, options.cc || "", from, "下書き作成(返信)", kind, note);
        return jsonOut({
          ok: true,
          draft: true,
          reply: true,
          from: from,
          to: to,
          subject: subject,
          threadId: threadId,
          hasAttachment: hasAttachment,
          logged: true,
        });
      }
      thread.reply(body, options);
      logRow_(to, subject, body, options.cc || "", from, "送信成功(返信)", kind, note);
      return jsonOut({
        ok: true,
        sent: true,
        reply: true,
        from: from,
        to: to,
        subject: subject,
        threadId: threadId,
        hasAttachment: hasAttachment,
        logged: true,
      });
    }

    if (mode === "draft") {
      GmailApp.createDraft(to, subject, body, options);
      logRow_(to, subject, body, options.cc || "", from, "下書き作成", kind, note);
      return jsonOut({
        ok: true,
        draft: true,
        from: from,
        to: to,
        subject: subject,
        hasAttachment: hasAttachment,
        logged: true,
      });
    }

    GmailApp.sendEmail(to, subject, body, options);
    logRow_(to, subject, body, options.cc || "", from, "送信成功", kind, note);
    return jsonOut({
      ok: true,
      sent: true,
      from: from,
      to: to,
      subject: subject,
      hasAttachment: hasAttachment,
      logged: true,
    });
  } catch (err) {
    try {
      logRow_(to, subject, body, options.cc || "", from, "失敗: " + String(err), kind, note);
    } catch (logErr) {}
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ===== ログ追記 =====
function logRow_(to, subject, body, cc, from, status, kind, note) {
  const ss = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    new Date(),
    to,
    subject,
    body,
    cc,
    from,
    status,
    kind,
    note,
  ]);
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * 特定送信元メールをゴミ箱へ一括移動（完全削除はしない）。
 * GAS エディタでこの関数を選択して実行する。
 * 既定は dry-run。実際に移動する場合は DO_EXEC を true にして再実行。
 *
 * 対象クエリ: from:nikkeibp.co.jp OR from:media-radar.jp
 */
function trashFromSenders() {
  const QUERY = 'from:nikkeibp.co.jp OR from:media-radar.jp';
  const DOMAINS = ['nikkeibp.co.jp', 'media-radar.jp'];
  const DO_EXEC = false; // true にするとゴミ箱へ移動

  const threads = GmailApp.search(QUERY);
  Logger.log('クエリ合計スレッド: ' + threads.length);

  DOMAINS.forEach(function (domain) {
    const n = GmailApp.search('from:' + domain).length;
    Logger.log('from:' + domain + ' → ' + n + ' スレッド');
  });

  if (!DO_EXEC) {
    Logger.log('dry-run: 移動していません。DO_EXEC=true にして再実行してください。');
    return;
  }

  let moved = 0;
  threads.forEach(function (t) {
    t.moveToTrash();
    moved++;
  });
  Logger.log('ゴミ箱へ移動: ' + moved + ' スレッド');

  const inboxLeft = GmailApp.search('(' + QUERY + ') in:inbox');
  Logger.log('受信トレイ残件: ' + inboxLeft.length);
}
