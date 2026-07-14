#!/usr/bin/env python3
"""GAS Webアプリ経由でメール送信（添付・スレッド返信対応）。"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = line.strip()
        if not m or m.startswith("#") or "=" not in m:
            continue
        key, val = m.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def main() -> None:
    load_env()
    exec_url = os.environ.get("GAS_EXEC_URL")
    token = os.environ.get("GAS_TOKEN")
    if not exec_url or not token:
        print("GAS_EXEC_URL と GAS_TOKEN を .env に設定してください", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--cc")
    parser.add_argument("--bcc")
    parser.add_argument("--html", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--attach")
    parser.add_argument("--mode", default="send", choices=["send", "draft"])
    parser.add_argument("--thread-id", help="既存スレッドへの返信（Gmail threadId）")
    args = parser.parse_args()

    use_post = bool(args.attach or args.thread_id)

    payload = {
        "token": token,
        "to": args.to,
        "subject": args.subject,
        "body": args.body,
        "mode": args.mode,
    }
    if args.cc:
        payload["cc"] = args.cc
    if args.bcc:
        payload["bcc"] = args.bcc
    if args.html:
        payload["html"] = "1"
    if args.dry_run:
        payload["dryrun"] = "1"
    if args.thread_id:
        payload["threadId"] = args.thread_id

    if args.attach:
        path = Path(args.attach)
        if not path.is_file():
            print(f"添付が見つかりません: {path}", file=sys.stderr)
            sys.exit(1)
        mime, _ = mimetypes.guess_type(str(path))
        payload["attachmentName"] = path.name
        payload["attachmentMimeType"] = mime or "application/pdf"
        payload["attachmentBase64"] = base64.b64encode(path.read_bytes()).decode("ascii")

    if use_post:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            exec_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    else:
        params = {k: v for k, v in payload.items() if k != "token"}
        params["token"] = token
        url = f"{exec_url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            body = res.read().decode("utf-8", errors="replace")
            print(f"HTTP {res.status}")
            print(body)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}")
        print(e.read().decode("utf-8", errors="replace"))
        sys.exit(1)


if __name__ == "__main__":
    main()
