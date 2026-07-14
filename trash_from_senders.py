#!/usr/bin/env python3
"""
指定送信元ドメインのメールを Gmail ゴミ箱へ一括移動する。

既定は dry-run（件数・ドメイン別内訳のみ表示）。
実際の移動は --exec 指定時のみ。完全削除は行わない。

認証:
  credentials/credentials.json … OAuth クライアント（Desktop 推奨）
  credentials/token.json … 初回認可後に自動保存

スコープ: https://www.googleapis.com/auth/gmail.modify
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CRED_DIR = ROOT / "credentials"
CREDENTIALS_FILE = CRED_DIR / "credentials.json"
TOKEN_FILE = CRED_DIR / "token.json"

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

DEFAULT_QUERY = "from:nikkeibp.co.jp OR from:media-radar.jp"
DOMAIN_KEYS = ("nikkeibp.co.jp", "media-radar.jp")
BATCH_SIZE = 1000
LIST_PAGE_SIZE = 500


def get_gmail_service():
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
            f"必要なスコープ: {SCOPES[0]}",
            file=sys.stderr,
        )
        raise SystemExit(2)

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            granted = set(creds.scopes or [])
            if set(SCOPES).issubset(granted):
                try:
                    creds.refresh(Request())
                except Exception:
                    creds = None
            else:
                creds = None
        else:
            creds = None

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CREDENTIALS_FILE), SCOPES
        )
        creds = flow.run_local_server(port=0)
        print("認可完了。token.json を更新しました。")

    CRED_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")

    return build("gmail", "v1", credentials=creds)


def list_all_message_ids(service, query: str) -> list[str]:
    ids: list[str] = []
    page_token = None
    while True:
        resp = (
            service.users()
            .messages()
            .list(
                userId="me",
                q=query,
                pageToken=page_token,
                maxResults=LIST_PAGE_SIZE,
            )
            .execute()
        )
        for m in resp.get("messages") or []:
            mid = m.get("id")
            if mid:
                ids.append(mid)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


def classify_by_domain(service, message_ids: list[str]) -> Counter:
    """From ヘッダを軽く取得してドメイン別内訳を出す（dry-run / 報告用）。"""
    counts: Counter = Counter()
    for mid in message_ids:
        meta = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=mid,
                format="metadata",
                metadataHeaders=["From"],
            )
            .execute()
        )
        headers = (meta.get("payload") or {}).get("headers") or []
        from_val = ""
        for h in headers:
            if h.get("name", "").lower() == "from":
                from_val = (h.get("value") or "").lower()
                break
        matched = False
        for domain in DOMAIN_KEYS:
            if domain in from_val:
                counts[domain] += 1
                matched = True
                break
        if not matched:
            counts["(other / unmatched)"] += 1
    return counts


def count_by_query(service) -> dict[str, int]:
    """ドメイン別件数は検索クエリで取る（metadata 全件取得より高速）。"""
    result: dict[str, int] = {}
    for domain in DOMAIN_KEYS:
        q = f"from:{domain}"
        ids = list_all_message_ids(service, q)
        result[domain] = len(ids)
    return result


def batch_trash(service, message_ids: list[str]) -> int:
    moved = 0
    for i in range(0, len(message_ids), BATCH_SIZE):
        chunk = message_ids[i : i + BATCH_SIZE]
        service.users().messages().batchModify(
            userId="me",
            body={
                "ids": chunk,
                "addLabelIds": ["TRASH"],
                "removeLabelIds": ["INBOX", "UNREAD"],
            },
        ).execute()
        moved += len(chunk)
        print(f"  ゴミ箱へ移動: {moved}/{len(message_ids)}")
    return moved


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="特定送信元メールを Gmail ゴミ箱へ一括移動（既定は dry-run）"
    )
    p.add_argument(
        "--exec",
        dest="do_exec",
        action="store_true",
        help="実際にゴミ箱へ移動する（省略時は dry-run）",
    )
    p.add_argument(
        "--query",
        default=DEFAULT_QUERY,
        help=f'Gmail 検索クエリ（既定: "{DEFAULT_QUERY}"）',
    )
    p.add_argument(
        "--detail",
        action="store_true",
        help="dry-run 時に From ヘッダから内訳を再集計（遅い）",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    mode = "EXEC" if args.do_exec else "DRY-RUN"
    print(f"=== 特定送信元メール → ゴミ箱移動 ({mode}) ===")
    print(f"クエリ: {args.query}")
    print()

    service = get_gmail_service()

    print("対象メッセージを収集中...")
    message_ids = list_all_message_ids(service, args.query)
    total = len(message_ids)
    print(f"合計: {total} 件")

    print("\nドメイン別内訳（各 from: クエリ）:")
    by_domain = count_by_query(service)
    for domain, n in by_domain.items():
        print(f"  {domain}: {n} 件")

    if args.detail and message_ids:
        print("\nFrom ヘッダからの内訳（詳細）:")
        detail = classify_by_domain(service, message_ids)
        for k, n in detail.most_common():
            print(f"  {k}: {n} 件")

    if not args.do_exec:
        print(
            "\ndry-run: ゴミ箱への移動は行っていません。"
            "\n実移動する場合は --exec を付けて再実行してください。"
        )
        return 0

    if total == 0:
        print("\n対象メールはありません。完了。")
        return 0

    print(f"\nゴミ箱へ移動を開始します（最大 {BATCH_SIZE} 件/バッチ）...")
    moved = batch_trash(service, message_ids)
    print(f"\n完了: {moved} 件をゴミ箱へ移動しました（完全削除はしていません）。")

    print("\n移動後の残件数確認:")
    remaining = list_all_message_ids(service, args.query)
    # ゴミ箱内は通常の検索に残る場合があるため、in:inbox を別途確認
    inbox_q = f"({args.query}) in:inbox"
    inbox_remaining = list_all_message_ids(service, inbox_q)
    print(f"  クエリ全体の残件（ゴミ箱含む可能性あり）: {len(remaining)} 件")
    print(f"  受信トレイ残件 ({inbox_q}): {len(inbox_remaining)} 件")
    if inbox_remaining:
        print("⚠ 受信トレイにまだ残っています。内容を確認してください。")
        return 1
    print("受信トレイに対象メールは残っていません。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
