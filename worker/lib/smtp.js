/**
 * Minimal SMTP submission client over the Cloudflare `connect()` socket.
 * Zero dependencies, one code path: implicit TLS on port 465.
 *
 * Verified against smtp.hostinger.com on 2026-07-28: the greeting is
 * `220 ESMTP`, EHLO answers a multiline `250-` block that advertises
 * `AUTH PLAIN LOGIN`, and AUTH LOGIN answers `235`. This client prefers
 * AUTH LOGIN when the server advertises it and falls back to AUTH PLAIN.
 *
 * STARTTLS on port 587 is a documented follow-up, not v1. One transport shape
 * keeps the test matrix small.
 *
 * SECURITY: no function here ever puts the username or the password into an
 * error, a return value, or a log line. Errors carry the step name and the
 * server reply only.
 */

import { encodeBase64 } from './mime.js';

const CRLF = '\r\n';
// Per-step ceiling. A hung read can never hold the queue consumer longer.
const STEP_TIMEOUT_MS = 10_000;
// Whole-dialogue ceiling. The live round trip measures about 2 s.
const DEFAULT_TOTAL_TIMEOUT_MS = 30_000;

const CODE_READY = 220;
const CODE_OK = 250;
const CODE_FORWARDED = 251;
const CODE_AUTH_CONTINUE = 334;
const CODE_AUTH_OK = 235;
const CODE_START_DATA = 354;
// Used when the failure is ours (timeout, closed socket) and no server code exists.
const CODE_NONE = 0;
// RFC 4616 separator inside the AUTH PLAIN token. Kept as an escape so no raw
// NUL byte ever sits in this source file.
const NUL = '\u0000';

/** An SMTP-level failure. `code` is the server reply code, `step` the phase. */
export class SmtpError extends Error {
    constructor(message, { code = CODE_NONE, step = 'unknown' } = {}) {
        super(message);
        this.name = 'SmtpError';
        this.code = code;
        this.step = step;
    }
}

/**
 * Wrap a socket that exposes web streams into the small io contract this
 * module uses: `{ read(), write(text), close() }`. Exported so the Node
 * smoke script and the unit suite can supply their own socket.
 */
export function createIo(socket) {
    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    return {
        async read() {
            const { value, done } = await reader.read();
            return done || !value ? '' : decoder.decode(value);
        },
        async write(text) {
            await writer.write(encoder.encode(text));
        },
        async close() {
            try { await writer.close(); } catch { /* peer may have closed first */ }
            try { await socket.close(); } catch { /* already closed */ }
        },
    };
}

/** Open an implicit-TLS socket on the Workers runtime. */
export async function openCloudflareSocket(host, port) {
    const { connect } = await import('cloudflare:sockets');
    return createIo(connect({ hostname: host, port: Number(port) }, { secureTransport: 'on', allowHalfOpen: false }));
}

/**
 * Pull one complete reply out of the buffer. SMTP continues a reply with
 * `250-text` lines and ends it with `250 text`. Returns null while the reply
 * is still incomplete.
 */
function parseReply(buffer) {
    const lines = [];
    let rest = buffer;
    for (;;) {
        const at = rest.indexOf(CRLF);
        if (at < 0) return null;
        const line = rest.slice(0, at);
        lines.push(line);
        rest = rest.slice(at + CRLF.length);
        if (/^\d{3}(\s|$)/.test(line)) {
            return { reply: { code: Number(line.slice(0, 3)), lines, text: lines.join(' ') }, rest };
        }
    }
}

/** Buffered reply reader over one io object. */
function createReplyReader(io) {
    let buffer = '';
    return async function readReply() {
        for (;;) {
            const parsed = parseReply(buffer);
            if (parsed) { buffer = parsed.rest; return parsed.reply; }
            const chunk = await io.read();
            if (!chunk) throw new SmtpError('The mail server closed the connection.', { step: 'read' });
            buffer += chunk;
        }
    };
}

/** Race one io operation against the step deadline and the total deadline. */
async function guard(step, deadline, run) {
    const remaining = Math.min(STEP_TIMEOUT_MS, deadline - Date.now());
    if (remaining <= 0) throw new SmtpError(`The mail server did not answer before ${step}.`, { step });
    let timer = null;
    const expiry = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SmtpError(`The mail server timed out at ${step}.`, { step })), remaining);
    });
    try {
        return await Promise.race([run(), expiry]);
    } finally {
        clearTimeout(timer);
    }
}

/** True when the EHLO block advertises the LOGIN mechanism. */
function advertisesAuthLogin(lines) {
    return lines.some((line) => /^\d{3}[- ]AUTH\b/i.test(line) && /\bLOGIN\b/i.test(line));
}

/**
 * Escape a leading dot on every line, then close with the DATA terminator.
 * Without this a body line of "." would end the message early.
 */
export function dotStuff(message) {
    const body = message.endsWith(CRLF) ? message : `${message}${CRLF}`;
    const escaped = body.replace(/\r\n\./g, `${CRLF}..`);
    return (escaped.startsWith('.') ? `.${escaped}` : escaped) + `.${CRLF}`;
}

/** AUTH LOGIN when advertised, AUTH PLAIN otherwise. Secrets never leak here. */
async function authenticate(step, cfg, ehloLines) {
    if (advertisesAuthLogin(ehloLines)) {
        await step('auth', `AUTH LOGIN${CRLF}`, [CODE_AUTH_CONTINUE]);
        await step('auth-user', `${encodeBase64(cfg.username)}${CRLF}`, [CODE_AUTH_CONTINUE]);
        await step('auth-password', `${encodeBase64(cfg.password)}${CRLF}`, [CODE_AUTH_OK]);
        return;
    }
    // RFC 4616: authorization-id NUL authentication-id NUL password.
    const token = encodeBase64(`${NUL}${cfg.username}${NUL}${cfg.password}`);
    await step('auth', `AUTH PLAIN ${token}${CRLF}`, [CODE_AUTH_OK]);
}

/** Run the whole client dialogue over an already-open io object. */
async function runDialogue(io, cfg, rawMessage, deadline) {
    const readReply = createReplyReader(io);
    const step = async (name, command, expected) => {
        if (command !== null) await guard(name, deadline, () => io.write(command));
        const reply = await guard(name, deadline, readReply);
        if (!expected.includes(reply.code)) {
            throw new SmtpError(`The mail server refused the ${name} step: ${reply.text}`, { code: reply.code, step: name });
        }
        return reply;
    };

    await step('greeting', null, [CODE_READY]);
    const ehlo = await step('ehlo', `EHLO ${cfg.heloDomain}${CRLF}`, [CODE_OK]);
    await authenticate(step, cfg, ehlo.lines);
    await step('mail-from', `MAIL FROM:<${cfg.from}>${CRLF}`, [CODE_OK]);
    await step('rcpt-to', `RCPT TO:<${cfg.to}>${CRLF}`, [CODE_OK, CODE_FORWARDED]);
    await step('data', `DATA${CRLF}`, [CODE_START_DATA]);
    const accepted = await step('body', dotStuff(rawMessage), [CODE_OK]);
    // QUIT is courtesy. The message is already accepted, so a failure here
    // must not turn a delivered mail into a reported error.
    try { await guard('quit', deadline, () => io.write(`QUIT${CRLF}`)); } catch { /* already accepted */ }
    return { ok: true, response: accepted.text };
}

/**
 * Send one message to one recipient.
 *
 * @param {{host: string, port: number|string, username: string, password: string,
 *          from: string, to: string, heloDomain: string, timeoutMs?: number}} cfg
 * @param {string} rawMessage Complete RFC 5322 message from buildMimeMessage.
 * @param {(host: string, port: number|string) => Promise<object>} openSocket Transport seam.
 * @returns {Promise<{ok: true, response: string}>} Throws SmtpError on refusal or timeout.
 */
export async function sendViaSmtp(cfg, rawMessage, openSocket = openCloudflareSocket) {
    const deadline = Date.now() + (cfg.timeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
    const io = await guard('connect', deadline, () => openSocket(cfg.host, cfg.port));
    try {
        return await runDialogue(io, cfg, rawMessage, deadline);
    } finally {
        await io.close().catch(() => {});
    }
}
