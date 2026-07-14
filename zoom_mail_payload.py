"""日本アラジール症候群の会向け Zoom URL 共有メールの文面定義。"""

FROM = "k.soeda@medi-canvas.com"
TO = "alagille@alagille.jp"
CC = "y.mori@medi-canvas.com"
SUBJECT = "明日のZoom URLのご共有（日本アラジール症候群の会）"

ZOOM_JOIN_URL = (
    "https://us06web.zoom.us/j/88577657690?pwd=tUZDn303uXQbIuhxzHT9WAXIymOM1a.1"
)
ZOOM_CHAT_URL = "https://us06web.zoom.us/launch/jc/88577657690"
MEETING_ID = "885 7765 7690"
PASSCODE = "265506"

BODY = f"""吉田様

お世話になっております。
株式会社メディキャンバスの副田です。

明日 7月15日（水）10:30〜のミーティングにつきまして、ZoomのURLをお送りいたします。

Zoom ミーティングに参加する
{ZOOM_JOIN_URL}

ミーティングチャットへのリンク
{ZOOM_CHAT_URL}

ミーティングID: {MEETING_ID}
パスコード: {PASSCODE}

当日はどうぞよろしくお願いいたします。

株式会社メディキャンバス
代表取締役 副田 渓

会社概要
大阪本社：大阪府大阪市北区梅田1-2-2 大阪駅前第2ビル 12-12
東京オフィス：東京都中央区日本橋茅場町1-8-1 茅場町一丁目ビル 7F
名古屋オフィス：名古屋市昭和区鶴舞1-2-32 STATION Ai 3F
会社HP：https://medi-canvas.com
"""
