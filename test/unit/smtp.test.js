// Unit coverage for worker/lib/smtp.js. Every case drives sendViaSmtp with a
// scripted fake io, so NO socket ever opens and no test can reach the network.
// The scripts mirror the real smtp.hostinger.com dialogue captured on
// 2026-07-28 (220 greeting, multiline 250- EHLO, AUTH LOGIN, 235, 250 queued).
import { sendViaSmtp, SmtpError, createIo, dotStuff } from '../../worker/lib/smtp.js';

const CFG = {
  host: 'smtp.example.test',
  port: 465,
  username: 'chris@chrisputer.tech',
  password: 'not-a-real-password',
  from: 'chris@chrisputer.tech',
  to: 'reader@example.com',
  heloDomain: 'chrisputer.tech',
  timeoutMs: 2000,
};

const EHLO_LOGIN = '250-smtp.example.test\r\n250-PIPELINING\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n';
const EHLO_PLAIN_ONLY = '250-smtp.example.test\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n';
const QUEUED = '250 2.0.0 Ok: queued as 4bXyz1\r\n';

const happyScript = (ehlo = EHLO_LOGIN) => [
  '220 ESMTP smtp.example.test\r\n',
  ehlo,
  '334 VXNlcm5hbWU6\r\n',
  '334 UGFzc3dvcmQ6\r\n',
  '235 2.7.0 Authentication successful\r\n',
  '250 2.1.0 Ok\r\n',
  '250 2.1.5 Ok\r\n',
  '354 End data with <CR><LF>.<CR><LF>\r\n',
  QUEUED,
];

// A fake io that replays scripted server chunks and records what was written.
function scriptedIo(script, options = {}) {
  const written = [];
  const state = { reads: 0, closed: 0 };
  return {
    written,
    state,
    async read() {
      if (options.hang) return new Promise(() => {});
      const chunk = script[state.reads];
      state.reads += 1;
      return chunk === undefined ? '' : chunk;
    },
    async write(text) {
      if (options.failWriteOn && text.startsWith(options.failWriteOn)) throw new Error('socket write failed');
      written.push(text);
    },
    async close() {
      state.closed += 1;
      if (options.failClose) throw new Error('close failed');
    },
  };
}

const openWith = (io) => async () => io;

export async function runSmtpTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => {
    if (cond) report.passed++; else { report.failed++; report.failures.push(`${name}: expected truthy`); }
  };
  const eq = (name, a, e) => {
    if (a === e) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); }
  };
  const rejects = async (name, fn) => {
    try { await fn(); report.failed++; report.failures.push(`${name}: expected a rejection`); return null; } catch (err) { report.passed++; return err; }
  };

  // 1. Happy path over AUTH LOGIN: exact client command sequence.
  {
    const io = scriptedIo(happyScript());
    const res = await sendViaSmtp(CFG, 'Subject: t\r\n\r\nbody\r\n', openWith(io));
    eq('send reports ok', res.ok, true);
    eq('the queue id comes back', res.response, '250 2.0.0 Ok: queued as 4bXyz1');
    eq('EHLO first', io.written[0], 'EHLO chrisputer.tech\r\n');
    eq('AUTH LOGIN second', io.written[1], 'AUTH LOGIN\r\n');
    eq('username is base64', io.written[2], `${btoa(CFG.username)}\r\n`);
    eq('password is base64', io.written[3], `${btoa(CFG.password)}\r\n`);
    eq('MAIL FROM next', io.written[4], 'MAIL FROM:<chris@chrisputer.tech>\r\n');
    eq('RCPT TO next', io.written[5], 'RCPT TO:<reader@example.com>\r\n');
    eq('DATA next', io.written[6], 'DATA\r\n');
    eq('body then terminator', io.written[7], 'Subject: t\r\n\r\nbody\r\n.\r\n');
    eq('QUIT last', io.written[8], 'QUIT\r\n');
    eq('nothing else was written', io.written.length, 9);
    eq('the socket was closed', io.state.closed, 1);
  }

  // 2. AUTH PLAIN fallback when the server does not advertise LOGIN.
  {
    const script = [
      '220 ESMTP\r\n', EHLO_PLAIN_ONLY, '235 2.7.0 Authentication successful\r\n',
      '250 Ok\r\n', '250 Ok\r\n', '354 Go\r\n', QUEUED,
    ];
    const io = scriptedIo(script);
    await sendViaSmtp(CFG, 'body\r\n', openWith(io));
    ok('AUTH PLAIN used', io.written[1].startsWith('AUTH PLAIN '));
    const token = io.written[1].slice('AUTH PLAIN '.length).trim();
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(token), (c) => c.charCodeAt(0)));
    const nul = String.fromCharCode(0);
    eq('token is NUL user NUL password', decoded, `${nul}${CFG.username}${nul}${CFG.password}`);
    eq('only one auth command was sent', io.written.filter((w) => w.startsWith('AUTH')).length, 1);
  }

  // 3. A multiline 250- EHLO block is consumed as ONE reply.
  {
    const io = scriptedIo(happyScript());
    await sendViaSmtp(CFG, 'body\r\n', openWith(io));
    eq('one read per server reply', io.state.reads, 9);
  }

  // 4. A reply split across TCP chunks is reassembled.
  {
    const script = [
      '220 ESM', 'TP ready\r\n',
      '250-one\r\n250-AUTH PLAIN LOG', 'IN\r\n250 last\r\n',
      '334 a\r\n', '334 b\r\n', '235 ok\r\n', '250 Ok\r\n', '250 Ok\r\n', '354 Go\r\n', QUEUED,
    ];
    const io = scriptedIo(script);
    const res = await sendViaSmtp(CFG, 'body\r\n', openWith(io));
    eq('split replies still succeed', res.ok, true);
  }

  // 5. Authentication failure: SmtpError with the code, and NO password in it.
  {
    const script = [
      '220 ESMTP\r\n', EHLO_LOGIN, '334 a\r\n', '334 b\r\n',
      '535 5.7.8 Error: authentication failed\r\n',
    ];
    const io = scriptedIo(script);
    const err = await rejects('535 rejects', () => sendViaSmtp(CFG, 'body\r\n', openWith(io)));
    ok('is an SmtpError', err instanceof SmtpError);
    eq('carries the server code', err.code, 535);
    eq('names the step', err.step, 'auth-password');
    ok('the password is not in the message', !err.message.includes(CFG.password));
    ok('the base64 password is not in the message', !err.message.includes(btoa(CFG.password)));
    ok('the username is not in the message', !err.message.includes(CFG.username));
    eq('the socket still closed', io.state.closed, 1);
  }

  // 6. A 4xx at RCPT stops the dialogue at that step.
  {
    const script = [
      '220 ESMTP\r\n', EHLO_LOGIN, '334 a\r\n', '334 b\r\n', '235 ok\r\n',
      '250 Ok\r\n', '450 4.2.1 Mailbox busy\r\n',
    ];
    const io = scriptedIo(script);
    const err = await rejects('450 at RCPT rejects', () => sendViaSmtp(CFG, 'body\r\n', openWith(io)));
    eq('code is 450', err.code, 450);
    eq('step is rcpt-to', err.step, 'rcpt-to');
    ok('DATA was never sent', !io.written.includes('DATA\r\n'));
  }

  // 7. A refused greeting fails before EHLO.
  {
    const io = scriptedIo(['554 no service here\r\n']);
    const err = await rejects('554 greeting rejects', () => sendViaSmtp(CFG, 'body\r\n', openWith(io)));
    eq('greeting step named', err.step, 'greeting');
    eq('nothing was written', io.written.length, 0);
  }

  // 8. A rejected message body surfaces the server reason.
  {
    const script = [
      '220 ESMTP\r\n', EHLO_LOGIN, '334 a\r\n', '334 b\r\n', '235 ok\r\n',
      '250 Ok\r\n', '250 Ok\r\n', '354 Go\r\n', '552 5.3.4 Message too big\r\n',
    ];
    const err = await rejects('552 body rejects', () => sendViaSmtp(CFG, 'body\r\n', openWith(scriptedIo(script))));
    eq('body step named', err.step, 'body');
    eq('code is 552', err.code, 552);
  }

  // 9. A closed connection mid-dialogue is an error, not a hang.
  {
    const io = scriptedIo(['220 ESMTP\r\n']);
    const err = await rejects('early close rejects', () => sendViaSmtp(CFG, 'body\r\n', openWith(io)));
    eq('read step named', err.step, 'read');
    ok('message says the server closed', err.message.includes('closed the connection'));
  }

  // 10. A socket that never answers hits the deadline instead of hanging.
  {
    const io = scriptedIo([], { hang: true });
    const started = Date.now();
    const err = await rejects('a hung read times out', () => sendViaSmtp({ ...CFG, timeoutMs: 40 }, 'body\r\n', openWith(io)));
    ok('is an SmtpError', err instanceof SmtpError);
    eq('greeting step named', err.step, 'greeting');
    ok('returned quickly', Date.now() - started < 1500);
  }

  // 11. A blown total deadline is reported before the next step runs.
  {
    const io = scriptedIo(happyScript());
    const err = await rejects('an exhausted deadline rejects', () => sendViaSmtp({ ...CFG, timeoutMs: -1 }, 'body\r\n', openWith(io)));
    ok('names the connect step', err.step === 'connect');
    ok('says it did not answer', err.message.includes('did not answer'));
  }

  // 12. The default total timeout applies when the caller gives none.
  {
    const io = scriptedIo(happyScript());
    const { timeoutMs, ...noTimeout } = CFG;
    const res = await sendViaSmtp(noTimeout, 'body\r\n', openWith(io));
    eq('default timeout still sends', res.ok, true);
  }

  // 13. Dot stuffing: a body line that starts with a dot is escaped.
  {
    const io = scriptedIo(happyScript());
    await sendViaSmtp(CFG, 'line one\r\n.hidden\r\n', openWith(io));
    eq('leading dot escaped', io.written[7], 'line one\r\n..hidden\r\n.\r\n');
    eq('a lone dot line is escaped', dotStuff('.\r\n'), '..\r\n.\r\n');
    eq('a first-character dot is escaped', dotStuff('.start\r\n'), '..start\r\n.\r\n');
    eq('a body with no trailing CRLF is terminated', dotStuff('abc'), 'abc\r\n.\r\n');
    eq('an inner dot mid-line is untouched', dotStuff('a.b\r\n'), 'a.b\r\n.\r\n');
  }

  // 14. QUIT is courtesy: a failure there cannot lose an accepted message.
  {
    const io = scriptedIo(happyScript(), { failWriteOn: 'QUIT' });
    const res = await sendViaSmtp(CFG, 'body\r\n', openWith(io));
    eq('accepted despite a failed QUIT', res.ok, true);
  }

  // 15. A failing close() cannot turn a delivered message into an error.
  {
    const io = scriptedIo(happyScript(), { failClose: true });
    const res = await sendViaSmtp(CFG, 'body\r\n', openWith(io));
    eq('accepted despite a failed close', res.ok, true);
  }

  // 16. A transport that cannot connect propagates its error.
  {
    const err = await rejects('a dead transport rejects', () => sendViaSmtp(CFG, 'body\r\n', async () => { throw new Error('connect refused'); }));
    eq('the connect error surfaces', err.message, 'connect refused');
  }

  // 17. A bare "250" line with no trailing text still terminates the reply.
  {
    const script = ['220\r\n', '250\r\n', '235 ok\r\n', '250 Ok\r\n', '250 Ok\r\n', '354 Go\r\n', QUEUED];
    const res = await sendViaSmtp(CFG, 'body\r\n', openWith(scriptedIo(script)));
    eq('bare code replies parse', res.ok, true);
  }

  // 18. A 251 at RCPT (forwarded) is accepted like a 250.
  {
    const script = [
      '220 ESMTP\r\n', EHLO_LOGIN, '334 a\r\n', '334 b\r\n', '235 ok\r\n',
      '250 Ok\r\n', '251 User not local; will forward\r\n', '354 Go\r\n', QUEUED,
    ];
    const res = await sendViaSmtp(CFG, 'body\r\n', openWith(scriptedIo(script)));
    eq('251 is accepted', res.ok, true);
  }

  // 19. createIo bridges a web-stream socket into the read/write/close contract.
  {
    const writes = [];
    const closes = [];
    const socket = {
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('220 hello\r\n'));
          controller.close();
        },
      }),
      writable: new WritableStream({ write(chunk) { writes.push(new TextDecoder().decode(chunk)); } }),
      async close() { closes.push(1); },
    };
    const io = createIo(socket);
    eq('read decodes the first chunk', await io.read(), '220 hello\r\n');
    await io.write('EHLO x\r\n');
    eq('write encodes through the stream', writes[0], 'EHLO x\r\n');
    eq('read returns empty at end of stream', await io.read(), '');
    await io.close();
    eq('close reached the socket', closes.length, 1);
  }

  // 20. createIo close() swallows a socket that is already gone.
  {
    const socket = {
      readable: new ReadableStream({ start(c) { c.close(); } }),
      writable: new WritableStream({ write() {} }),
      async close() { throw new Error('already closed'); },
    };
    const io = createIo(socket);
    await io.close();
    report.passed++; // reaching here means nothing propagated
  }

  return report;
}
