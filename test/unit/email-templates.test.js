// Unit coverage for worker/lib/email-templates.js — the three messages.
// Checks the copy carries its link, that the notification is a real list
// message (RFC 8058 headers), that the receipt is NOT, and that a hostile
// query cannot break out of the HTML part.
import {
  confirmationEmail, reportReadyEmail, unsubReceiptEmail, sanitizeLine, SITE_URL,
} from '../../worker/lib/email-templates.js';

const CONFIRM_URL = 'https://chrisputer.tech/confirm?token=abc123';
const REPORT_URL = 'https://chrisputer.tech/research/best-office-chairs';
const UNSUB_URL = 'https://chrisputer.tech/unsubscribe?token=def456';

export function runEmailTemplatesTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => {
    if (cond) report.passed++; else { report.failed++; report.failures.push(`${name}: expected truthy`); }
  };
  const eq = (name, a, e) => {
    if (a === e) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); }
  };

  // 1. Confirmation message.
  {
    const msg = confirmationEmail({ query: 'best office chairs', confirmUrl: CONFIRM_URL });
    eq('subject is fixed', msg.subject, 'Confirm your TrueRank email notification');
    ok('text names the topic', msg.text.includes('"best office chairs"'));
    ok('text carries the link', msg.text.includes(CONFIRM_URL));
    ok('text states the 7 day window', msg.text.includes('works for 7 days'));
    ok('text tells the reader they can ignore it', msg.text.includes('ignore this'));
    ok('html carries the link', msg.html.includes(`href="${CONFIRM_URL}"`));
    ok('html has no image', !msg.html.includes('<img'));
    ok('html has no script', !msg.html.includes('<script'));
    ok('html loads no external asset', !msg.html.includes('src='));
    ok('no list header on a confirmation', msg.extraHeaders === undefined);
  }

  // 2. Confirmation with no known query falls back to the general sentence.
  {
    const msg = confirmationEmail({ query: null, confirmUrl: CONFIRM_URL });
    ok('general opening used', msg.text.startsWith('You asked TrueRank to email you when new research is ready.'));
    ok('still carries the link', msg.text.includes(CONFIRM_URL));
    const blank = confirmationEmail({ query: '   ', confirmUrl: CONFIRM_URL });
    ok('a blank query is treated as unknown', blank.text.includes('when new research is ready'));
  }

  // 3. Report-ready message carries the unsubscribe link in body AND headers.
  {
    const msg = reportReadyEmail({ query: 'best office chairs', reportUrl: REPORT_URL, unsubUrl: UNSUB_URL });
    eq('subject names the query', msg.subject, 'Your TrueRank report is ready: best office chairs');
    ok('text carries the report link', msg.text.includes(REPORT_URL));
    ok('text carries the unsubscribe link', msg.text.includes(UNSUB_URL));
    ok('text explains why it arrived', msg.text.includes('because you asked'));
    ok('text invites a reply', msg.text.includes('Reply to this email'));
    eq('List-Unsubscribe is bracketed', msg.extraHeaders['List-Unsubscribe'], `<${UNSUB_URL}>`);
    eq('RFC 8058 one-click header', msg.extraHeaders['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    ok('html carries the report link', msg.html.includes(`href="${REPORT_URL}"`));
    ok('html carries the unsubscribe link', msg.html.includes('unsubscribe?token=def456'));
  }

  // 4. A hostile query cannot inject markup into the HTML part.
  {
    const msg = reportReadyEmail({
      query: '<script>alert(1)</script>',
      reportUrl: REPORT_URL,
      unsubUrl: UNSUB_URL,
    });
    ok('no raw script tag in the html', !msg.html.includes('<script>'));
    ok('the tag is escaped', msg.html.includes('&lt;script&gt;'));
    ok('the subject keeps the literal text', msg.subject.includes('<script>alert(1)</script>'));
    const confirm = confirmationEmail({ query: '<img src=x onerror=1>', confirmUrl: CONFIRM_URL });
    ok('confirmation escapes the query too', !confirm.html.includes('<img src=x'));
  }

  // 5. Unsubscribe receipt is transactional: no list headers at all.
  {
    const msg = unsubReceiptEmail();
    eq('subject is fixed', msg.subject, 'You are unsubscribed from TrueRank');
    ok('no List-Unsubscribe header', msg.extraHeaders === undefined);
    ok('text has no unsubscribe link', !msg.text.includes('/unsubscribe'));
    ok('text says we will not write again', msg.text.includes('will not send you further email'));
    ok('text offers a way back', msg.text.includes('subscribe again'));
    ok('html has no link element', !msg.html.includes('<a '));
  }

  // 6. sanitizeLine flattens anything that could break a header.
  {
    eq('newlines collapse', sanitizeLine('a\r\nBcc: v@x.com'), 'a Bcc: v@x.com');
    eq('tabs collapse', sanitizeLine('a\t\tb'), 'a b');
    eq('outer space trims', sanitizeLine('  spaced  '), 'spaced');
    eq('null becomes empty', sanitizeLine(null), '');
    eq('undefined becomes empty', sanitizeLine(undefined), '');
    eq('short text is untouched', sanitizeLine('plain'), 'plain');
    const long = sanitizeLine('x'.repeat(200));
    eq('long text is capped', long.length, 120);
    ok('capped text ends with an ellipsis', long.endsWith('…'));
    eq('a custom cap applies', sanitizeLine('abcdef', 3), 'ab…');
  }

  // 7. A query with a line break cannot reach the subject as two lines.
  {
    const msg = reportReadyEmail({ query: 'chairs\r\nBcc: victim@example.com', reportUrl: REPORT_URL, unsubUrl: UNSUB_URL });
    ok('subject has no CR', !msg.subject.includes('\r'));
    ok('subject has no LF', !msg.subject.includes('\n'));
  }

  // 8. The site URL constant is the canonical https origin.
  {
    eq('site url is canonical', SITE_URL, 'https://chrisputer.tech');
  }

  return report;
}
