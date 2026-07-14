#!/usr/bin/env python3
"""指示書どおりの宛先・件名・本文（Zoom URL / ID / パスコード）を検証する。"""

from __future__ import annotations

import unittest

from zoom_mail_payload import (
    BODY,
    CC,
    FROM,
    MEETING_ID,
    PASSCODE,
    SUBJECT,
    TO,
    ZOOM_CHAT_URL,
    ZOOM_JOIN_URL,
)


class TestZoomMailPayload(unittest.TestCase):
    def test_addresses(self):
        self.assertEqual(FROM, "k.soeda@medi-canvas.com")
        self.assertEqual(TO, "alagille@alagille.jp")
        self.assertEqual(CC, "y.mori@medi-canvas.com")

    def test_subject(self):
        self.assertEqual(SUBJECT, "明日のZoom URLのご共有（日本アラジール症候群の会）")

    def test_zoom_details_in_body(self):
        self.assertIn(ZOOM_JOIN_URL, BODY)
        self.assertIn(ZOOM_CHAT_URL, BODY)
        self.assertIn(f"ミーティングID: {MEETING_ID}", BODY)
        self.assertIn(f"パスコード: {PASSCODE}", BODY)
        self.assertEqual(MEETING_ID, "885 7765 7690")
        self.assertEqual(PASSCODE, "265506")

    def test_body_structure(self):
        self.assertTrue(BODY.startswith("吉田様"))
        self.assertIn("株式会社メディキャンバスの副田です。", BODY)
        self.assertIn("7月15日（水）10:30", BODY)
        self.assertIn("代表取締役 副田 渓", BODY)

    def test_build_message_headers(self):
        from create_zoom_mail import build_message

        msg = build_message(to=TO, subject=SUBJECT, body=BODY, cc=CC)
        self.assertEqual(msg["To"], TO)
        self.assertEqual(msg["Cc"], CC)
        self.assertEqual(msg["From"], FROM)
        self.assertEqual(msg["Subject"], SUBJECT)
        self.assertIn(PASSCODE, msg.get_content())


if __name__ == "__main__":
    unittest.main()
