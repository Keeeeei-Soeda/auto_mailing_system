#!/usr/bin/env python3
"""請求書メールを Gmail の下書きとして作成する（既定）。

既定は下書き作成。確認後に送る場合は --send を付ける。
認証: credentials.json（OAuth クライアント）と token.json（初回ブラウザ認証後に生成）。
"""

from __future__ import annotations

import argparse
import base64
import mimetypes
import os
import sys
from email.message import EmailMessage
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
]

DEFAULT_TO = "kozo.nishimori@mkmjapan.jp"
DEFAULT_SUBJECT = "【メディキャンバス】ALS患者インタビュー調査 ご請求書送付の件"
DEFAULT_BODY = """西森様

お世話になっております。
先般のALS患者インタビュー調査につきまして、請求書を添付にてお送りいたします。
ご査収のほどよろしくお願いいたします。

なお、恐れ入りますが振込手数料は貴社にてご負担いただけますと幸いです。
ご不明点がございましたらお知らせください。

株式会社メディキャンバス
代表取締役 副田 渓
大阪府大阪市北区梅田1-2-2 大阪駅前第2ビル 12-12
https://medi-canvas.com
"""
DEFAULT_ATTACHMENT = Path(__file__).resolve().parent / "attachments" / "請求書_メディカルナレッジマネジメント_20260714.pdf"
CREDENTIALS_PATH = Path(__file__).resolve().parent / "credentials.json"
TOKEN_PATH = Path(__file__).resolve().parent / "token.json"


def get_credentials() -> Credentials:
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                print(
                    "credentials.json がありません。\n"
                    "Google Cloud Console で OAuth クライアント（デスクトップ）を作成し、\n"
                    f"{CREDENTIALS_PATH} として保存してください。",
                    file=sys.stderr,
                )
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    return creds


def build_message(
    *,
    to: str,
    subject: str,
    body: str,
    attachment_path: Path,
    from_addr: str | None = None,
) -> dict:
    if not attachment_path.is_file():
        raise FileNotFoundError(f"添付ファイルが見つかりません: {attachment_path}")

    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    if from_addr:
        msg["From"] = from_addr
    msg.set_content(body)

    mime_type, _ = mimetypes.guess_type(str(attachment_path))
    if mime_type is None:
        mime_type = "application/pdf"
    maintype, subtype = mime_type.split("/", 1)
    msg.add_attachment(
        attachment_path.read_bytes(),
        maintype=maintype,
        subtype=subtype,
        filename=attachment_path.name,
    )

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    return {"raw": raw}


def main() -> None:
    parser = argparse.ArgumentParser(description="請求書メールの Gmail 下書き作成 / 送信")
    parser.add_argument("--to", default=DEFAULT_TO)
    parser.add_argument("--subject", default=DEFAULT_SUBJECT)
    parser.add_argument("--body-file", help="本文をファイルから読む（未指定なら指示書どおり）")
    parser.add_argument("--attachment", type=Path, default=DEFAULT_ATTACHMENT)
    parser.add_argument("--from", dest="from_addr", default="k.soeda@medi-canvas.com")
    parser.add_argument("--thread-id", help="既存スレッドに紐付ける場合の threadId")
    parser.add_argument(
        "--send",
        action="store_true",
        help="下書きではなく送信する（既定は下書き）",
    )
    args = parser.parse_args()

    body = Path(args.body_file).read_text(encoding="utf-8") if args.body_file else DEFAULT_BODY

    print("--- 作成内容 ---")
    print(f"To     : {args.to}")
    print(f"From   : {args.from_addr}")
    print(f"Subject: {args.subject}")
    print(f"Attach : {args.attachment}")
    print(f"Mode   : {'SEND' if args.send else 'DRAFT'}")
    print("--- 本文 ---")
    print(body)
    print("--------------")

    creds = get_credentials()
    service = build("gmail", "v1", credentials=creds)
    message = build_message(
        to=args.to,
        subject=args.subject,
        body=body,
        attachment_path=args.attachment,
        from_addr=args.from_addr,
    )
    if args.thread_id:
        message["threadId"] = args.thread_id

    if args.send:
        result = service.users().messages().send(userId="me", body=message).execute()
        print(f"送信しました。 id={result.get('id')} threadId={result.get('threadId')}")
    else:
        result = service.users().drafts().create(userId="me", body={"message": message}).execute()
        draft_id = result.get("id")
        msg_id = (result.get("message") or {}).get("id")
        print(f"下書きを作成しました。 draftId={draft_id} messageId={msg_id}")
        print("Gmail の下書きを開き、宛先・件名・本文・添付を確認してください。")


if __name__ == "__main__":
    main()
