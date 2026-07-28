// Unit coverage for worker/lib/mime.js — the pure RFC 5322 / 2045 builder.
// The sharp edge here is header injection: a CR or LF in any header value must
// throw, never be quietly cleaned.
import {
  buildMimeMessage, encodeBase64, encodeHeaderWord, formatMailDate, isValidEmailAddress,
} from '../../worker/lib/mime.js';

const FIXED = {
  from: 'chris@chrisputer.tech',
  fromName: 'Chris at TrueRank',
  to: 'reader@example.com',
  subject: 'Your TrueRank report is ready',
  text: 'Plain body.',
  html: '<p>HTML body.</p>',
  date: new Date(Date.UTC(2026, 6, 28, 9, 5, 3)),
  messageId: '<fixed-id@chrisputer.tech>',
  boundary: 'fixed-boundary',
};

const decodeBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

export function runEmailMimeTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => {
    if (cond) report.passed++; else { report.failed++; report.failures.push(`${name}: expected truthy`); }
  };
  const eq = (name, a, e) => {
    if (a === e) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); }
  };
  const throws = (name, fn) => {
    try { fn(); report.failed++; report.failures.push(`${name}: expected a throw`); } catch { report.passed++; }
  };

  // 1. Every required header is present, once.
  {
    const msg = buildMimeMessage(FIXED);
    const head = msg.split('\r\n\r\n')[0];
    for (const h of ['From:', 'To:', 'Subject:', 'Date:', 'Message-ID:', 'MIME-Version:', 'Auto-Submitted:', 'Content-Type:']) {
      ok(`header ${h} present`, head.includes(`\r\n${h}`) || head.startsWith(h));
    }
    ok('From carries the display name', head.includes('From: "Chris at TrueRank" <chris@chrisputer.tech>'));
    ok('To is the recipient', head.includes('To: reader@example.com'));
    ok('Date is RFC 5322 UTC', head.includes('Date: Tue, 28 Jul 2026 09:05:03 +0000'));
    ok('multipart/alternative with the boundary', head.includes('Content-Type: multipart/alternative; boundary="fixed-boundary"'));
    ok('auto-generated marker', head.includes('Auto-Submitted: auto-generated'));
  }

  // 2. Deterministic output for fixed inputs (same in, same out).
  {
    eq('same inputs produce the same message', buildMimeMessage(FIXED), buildMimeMessage(FIXED));
  }

  // 3. Both parts are base64 and decode back to the originals.
  {
    const msg = buildMimeMessage(FIXED);
    const parts = msg.split('--fixed-boundary');
    ok('three boundary splits plus the closer', parts.length === 4);
    const bodyOf = (part) => part.split('\r\n\r\n')[1].split('\r\n').join('');
    eq('text part decodes', decodeBase64(bodyOf(parts[1])), FIXED.text);
    eq('html part decodes', decodeBase64(bodyOf(parts[2])), FIXED.html);
    ok('text part declares base64', parts[1].includes('Content-Transfer-Encoding: base64'));
    ok('text part is text/plain utf-8', parts[1].includes('Content-Type: text/plain; charset="utf-8"'));
    ok('html part is text/html utf-8', parts[2].includes('Content-Type: text/html; charset="utf-8"'));
    ok('message closes the multipart', msg.includes('--fixed-boundary--\r\n'));
  }

  // 4. Base64 wraps at 76 columns.
  {
    const msg = buildMimeMessage({ ...FIXED, text: 'x'.repeat(4000) });
    const bodyLines = msg.split('\r\n').filter((l) => /^[A-Za-z0-9+/=]{20,}$/.test(l));
    ok('long body produced several base64 lines', bodyLines.length > 10);
    ok('no base64 line is longer than 76 columns', bodyLines.every((l) => l.length <= 76));
    ok('most base64 lines are exactly 76 columns', bodyLines.filter((l) => l.length === 76).length >= bodyLines.length - 1);
  }

  // 5. Header injection: CR or LF in any header value throws.
  {
    throws('CR in subject throws', () => buildMimeMessage({ ...FIXED, subject: 'a\rb' }));
    throws('LF in subject throws', () => buildMimeMessage({ ...FIXED, subject: 'a\nBcc: victim@example.com' }));
    throws('CRLF in an extra header value throws', () => buildMimeMessage({ ...FIXED, extraHeaders: { 'X-Test': 'a\r\nBcc: v@x.com' } }));
    throws('LF in an extra header name throws', () => buildMimeMessage({ ...FIXED, extraHeaders: { 'X\nBcc': 'v' } }));
    throws('LF in the from name throws', () => buildMimeMessage({ ...FIXED, fromName: 'Chris\nBcc: v@x.com' }));
    throws('CR in the Message-ID throws', () => buildMimeMessage({ ...FIXED, messageId: '<a\rb@x>' }));
  }

  // 6. Address validation on both envelope ends.
  {
    throws('a broken to address throws', () => buildMimeMessage({ ...FIXED, to: 'not-an-email' }));
    throws('an empty to address throws', () => buildMimeMessage({ ...FIXED, to: '' }));
    throws('a to address with a newline throws', () => buildMimeMessage({ ...FIXED, to: 'a@b.c\nx' }));
    throws('a broken from address throws', () => buildMimeMessage({ ...FIXED, from: 'nope' }));
    eq('valid address accepted', isValidEmailAddress('a.b+c@sub.example.co.uk'), true);
    eq('spaces rejected', isValidEmailAddress('a b@example.com'), false);
    eq('over-long address rejected', isValidEmailAddress(`${'a'.repeat(250)}@example.com`), false);
    eq('non-string rejected', isValidEmailAddress(null), false);
  }

  // 7. RFC 2047 encoded word only when the subject is not ASCII.
  {
    eq('ascii subject stays literal', encodeHeaderWord('Plain ASCII'), 'Plain ASCII');
    const encoded = encodeHeaderWord('Beste Kopfhörer');
    ok('non-ascii subject is encoded', encoded.startsWith('=?utf-8?B?') && encoded.endsWith('?='));
    eq('encoded word round-trips', decodeBase64(encoded.slice(10, -2)), 'Beste Kopfhörer');
    const msg = buildMimeMessage({ ...FIXED, subject: 'Kopfhörer für 100 €' });
    ok('built message carries the encoded subject', msg.includes('Subject: =?utf-8?B?'));
    ok('no raw non-ascii in the header block', !msg.split('\r\n\r\n')[0].includes('ö'));
  }

  // 8. extraHeaders pass through in order, before Content-Type.
  {
    const msg = buildMimeMessage({
      ...FIXED,
      extraHeaders: {
        'List-Unsubscribe': '<https://chrisputer.tech/unsubscribe?token=abc>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    ok('List-Unsubscribe present', msg.includes('List-Unsubscribe: <https://chrisputer.tech/unsubscribe?token=abc>'));
    ok('RFC 8058 post header present', msg.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'));
    ok('extra headers precede Content-Type', msg.indexOf('List-Unsubscribe:') < msg.indexOf('Content-Type: multipart'));
  }

  // 9. Generated defaults: unique boundary, unique Message-ID, real date.
  {
    const a = buildMimeMessage({ from: FIXED.from, to: FIXED.to, subject: 's', text: 't', html: '<p>h</p>' });
    const b = buildMimeMessage({ from: FIXED.from, to: FIXED.to, subject: 's', text: 't', html: '<p>h</p>' });
    const boundaryOf = (m) => m.match(/boundary="([^"]+)"/)[1];
    ok('generated boundaries differ', boundaryOf(a) !== boundaryOf(b));
    ok('generated boundary is prefixed', boundaryOf(a).startsWith('tr-'));
    const idOf = (m) => m.match(/Message-ID: (<[^>]+>)/)[1];
    ok('generated Message-IDs differ', idOf(a) !== idOf(b));
    ok('Message-ID uses the sender domain', idOf(a).endsWith('@chrisputer.tech>'));
    ok('a Date header was generated', /Date: \w{3}, \d{1,2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000/.test(a));
    ok('no display name means a bare From address', a.includes('From: chris@chrisputer.tech\r\n'));
  }

  // 10. Base64 helper: UTF-8 safe and byte-array safe.
  {
    eq('ascii encodes', encodeBase64('hello'), 'aGVsbG8=');
    eq('utf-8 round-trips', decodeBase64(encodeBase64('héllo ✓')), 'héllo ✓');
    eq('byte array encodes', encodeBase64(new TextEncoder().encode('hello')), 'aGVsbG8=');
    eq('empty string encodes', encodeBase64(''), '');
    const big = 'a'.repeat(100_000);
    eq('a large body encodes without blowing the argument limit', decodeBase64(encodeBase64(big)).length, big.length);
  }

  // 11. Date formatting pads and uses UTC names.
  {
    eq('single-digit time pads', formatMailDate(new Date(Date.UTC(2026, 0, 4, 3, 2, 1))), 'Sun, 4 Jan 2026 03:02:01 +0000');
    eq('december maps correctly', formatMailDate(new Date(Date.UTC(2026, 11, 31, 23, 59, 59))), 'Thu, 31 Dec 2026 23:59:59 +0000');
  }

  return report;
}
