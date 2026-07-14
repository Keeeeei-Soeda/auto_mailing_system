import { strict as assert } from 'node:assert';
import {
  BODY,
  CC,
  FROM,
  MEETING_ID,
  PASSCODE,
  SUBJECT,
  TO,
  ZOOM_CHAT_URL,
  ZOOM_JOIN_URL,
} from './zoom_mail_payload.mjs';

assert.equal(FROM, 'k.soeda@medi-canvas.com');
assert.equal(TO, 'alagille@alagille.jp');
assert.equal(CC, 'y.mori@medi-canvas.com');
assert.equal(SUBJECT, '明日のZoom URLのご共有（日本アラジール症候群の会）');
assert.equal(MEETING_ID, '885 7765 7690');
assert.equal(PASSCODE, '265506');
assert.ok(BODY.includes(ZOOM_JOIN_URL));
assert.ok(BODY.includes(ZOOM_CHAT_URL));
assert.ok(BODY.includes(`ミーティングID: ${MEETING_ID}`));
assert.ok(BODY.includes(`パスコード: ${PASSCODE}`));
assert.ok(BODY.startsWith('吉田様'));
assert.ok(BODY.includes('7月15日（水）10:30'));

console.log('OK: zoom_mail_payload の検証にすべて合格');
