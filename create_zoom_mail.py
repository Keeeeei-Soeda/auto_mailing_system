#!/usr/bin/env python3
"""
Zoom URL共有メールを Gmail API で下書き作成（既定）／送信（--send）する。

認証:
  credentials/credentials.json … OAuth クライアント（Desktop 推奨）
  credentials/token.json … 初回認可後に自動保存

スコープ: gmail.compose（下書き） / --send 時は gmail.send も使用
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from email.message import EmailMessage
from pathlib import Path

from zoom_mail_payload import BODY, CC, FROM, SUBJECT, TO

ROOT = Path(__file__).resolve().parent
CRED_DIR = ROOT / "credentials"
CREDENTIALS_FILE = CRED_DIR / "credentials.json"
TOKEN_FILE = CRED_DIR / "token.json"

SCOPES_DRAFT = ["https://www.googleapis.com/auth/gmail.compose"]
SCOPES_SEND = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
]


def build_message(
    *,
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
    sender: str = FROM,
) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = to
    msg["From"] = sender
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = cc
    msg.set_content(body)
    return msg


def message_to_raw(msg: EmailMessage) -> dict:
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    return {"raw": raw}


def get_gmail_service(scopes: list[str]):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as e:
        print(
            "必要なパッケージがありません。次を実行してください:\n"
            "  pip3 install google-api-python-client google-auth-oauthlib",
            file=sys.stderr,
        )
        raise SystemExit(1) from e

    if not CREDENTIALS_FILE.exists():
        print(
            f"OAuth クライアントが見つかりません: {CREDENTIALS_FILE}\n"
            "Google Cloud Console で Desktop アプリの OAuth クライアントを作成し、\n"
            "JSON を credentials/credentials.json として配置してください。\n"
            "必要なスコープ: gmail.compose（および --send 時は gmail.send）",
            file=sys.stderr,
        )
        raise SystemExit(2)

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), scopes)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), scopes
            )
            creds = flow.run_local_server(port=0)
        CRED_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")

    return build("gmail", "v1", credentials=creds)


def create_draft(service, msg: EmailMessage, thread_id: str | None = None) -> dict:
    body = {"message": message_to_raw(msg)}
    if thread_id:
        body["message"]["threadId"] = thread_id
    return service.users().drafts().create(userId="me", body=body).execute()


def send_message(service, msg: EmailMessage, thread_id: str | None = None) -> dict:
    raw = message_to_raw(msg)
    if thread_id:
        raw["threadId"] = thread_id
    return service.users().messages().send(userId="me", body=raw).execute()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Zoom共有メールの下書き作成／送信")
    p.add_argument(
        "--send",
        action="store_true",
        help="下書きではなく送信する（確認後のみ使用）",
    )
    p.add_argument(
        "--test",
        action="store_true",
        help="テスト宛先 pharnewton@gmail.com へ（本番 To/CC は使わない）",
    )
    p.add_argument("--to", default=None, help="宛先上書き")
    p.add_argument("--cc", default=None, help="CC上書き")
    p.add_argument("--subject", default=None, help="件名上書き")
    p.add_argument("--thread-id", default=None, help="既存スレッドへ紐付け")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="APIを呼ばず内容だけ表示する",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    to = args.to or TO
    cc = args.cc if args.cc is not None else CC
    subject = args.subject or SUBJECT
    body = BODY

    if args.test:
        to = "pharnewton@gmail.com"
        cc = ""
        subject = f"[TEST] {subject}"
        body = (
            "【テスト送信】本番予定の宛先:\n"
            f"To: {TO}\n"
            f"CC: {CC}\n"
            f"From: {FROM}\n"
            "----------\n\n"
            + BODY
        )

    msg = build_message(to=to, subject=subject, body=body, cc=cc or None)

    print("=== メール内容 ===")
    print(f"From: {FROM}")
    print(f"To:   {to}")
    print(f"CC:   {cc or '(なし)'}")
    print(f"Subj: {subject}")
    print("--- body ---")
    print(body)
    print("==============")

    if args.dry_run:
        print("dry-run: API は呼び出していません。")
        return 0

    scopes = SCOPES_SEND if args.send else SCOPES_DRAFT
    service = get_gmail_service(scopes)

    if args.send:
        result = send_message(service, msg, args.thread_id)
        print(f"送信完了: id={result.get('id')} threadId={result.get('threadId')}")
    else:
        result = create_draft(service, msg, args.thread_id)
        draft_id = result.get("id")
        message = result.get("message") or {}
        print(
            f"下書き作成完了: draftId={draft_id} "
            f"messageId={message.get('id')} threadId={message.get('threadId')}"
        )
        print("Gmail の下書きを開き、宛先・CC・Zoom URL・ID・パスコードを確認してください。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
