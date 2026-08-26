/**
 * Pure RFC 5322 / RFC 2045 message builder. No I/O, no platform bindings.
 *
 * The output is one CRLF-terminated string ready for the SMTP DATA command.
 * Both body parts are base64 encoded and wrapped at 76 columns, so every line
 * is short and 7-bit safe. That removes the need for quoted-printable code.
 *
 * Header injection is the sharp edge here: a CR or LF inside any header value
 * lets a caller add headers or a body. Every value goes through assertNoCrlf
 * first, and a bad value throws instead of being silently cleaned.
 */

const CRLF = '\r\n';
const B64_LINE_LEN = 76;
// btoa takes a binary string. Convert the byte array in chunks so a large body
// never blows the argument limit of String.fromCharCode.
const BYTE_CHUNK = 0x8000;
const ASCII_MAX = 0x7f;

// Same pragmatic check worker/handlers/subscribe.js uses at intake. It is
// deliberately not RFC 5322: it only has to reject obvious junk before the
// address reaches an SMTP envelope.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LEN = 254;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** True when the address passes the intake check and the length limit. */
export function isValidEmailAddress(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= EMAIL_MAX_LEN && EMAIL_RE.test(value);
}

/** Base64-encode a string (as UTF-8) or a byte array. */
export function encodeBase64(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += BYTE_CHUNK) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + BYTE_CHUNK)));
    }
    return btoa(chunks.join(''));
}

/** Throw when a header value carries a CR or LF (header injection guard). */
function assertNoCrlf(name, value) {
    const text = String(value ?? '');
    if (/[\r\n]/.test(text)) throw new Error(`Header ${name} contains a line break.`);
    return text;
}

/** Split a base64 blob into 76-column lines, as RFC 2045 requires. */
function wrapBase64(encoded) {
    const lines = [];
    for (let i = 0; i < encoded.length; i += B64_LINE_LEN) lines.push(encoded.slice(i, i + B64_LINE_LEN));
    return lines.join(CRLF);
}

/** True when every character is plain ASCII. */
function isAscii(text) {
    for (const ch of text) { if (ch.codePointAt(0) > ASCII_MAX) return false; }
    return true;
}

/** RFC 2047 encoded word for a header that carries non-ASCII text. */
export function encodeHeaderWord(text) {
    return isAscii(text) ? text : `=?utf-8?B?${encodeBase64(text)}?=`;
}

/** RFC 5322 date, always in UTC (`+0000`). */
export function formatMailDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const day = DAYS[date.getUTCDay()];
    const month = MONTHS[date.getUTCMonth()];
    const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    return `${day}, ${date.getUTCDate()} ${month} ${date.getUTCFullYear()} ${time} +0000`;
}

/** `"Display Name" <addr@host>` when a name is given, else the bare address. */
function formatAddress(address, name) {
    if (!name) return address;
    return `"${assertNoCrlf('From name', name).replace(/"/g, '')}" <${address}>`;
}

/** One base64 multipart/alternative part. */
function mimePart(boundary, contentType, body) {
    return [
        `--${boundary}`,
        `Content-Type: ${contentType}; charset="utf-8"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(encodeBase64(body)),
        '',
    ].join(CRLF);
}

/** Turn the header pairs into folded-free `Name: value` lines. */
function renderHeaders(pairs) {
    return pairs.map(([name, value]) => `${name}: ${value}`).join(CRLF);
}

/**
 * Build the full message.
 *
 * @param {{from: string, fromName?: string, to: string, subject: string,
 *          text: string, html: string, extraHeaders?: Record<string,string>,
 *          date?: Date, messageId?: string, boundary?: string}} input
 * @returns {string} the complete message, headers and body, CRLF terminated.
 */
export function buildMimeMessage(input) {
    const { from, fromName = '', to, subject, text, html, extraHeaders = {} } = input;
    if (!isValidEmailAddress(from)) throw new Error('From address is not valid.');
    if (!isValidEmailAddress(to)) throw new Error('To address is not valid.');

    const boundary = input.boundary || `tr-${crypto.randomUUID()}`;
    const messageId = input.messageId || `<${crypto.randomUUID()}@${from.slice(from.indexOf('@') + 1)}>`;
    const date = input.date || new Date();

    const base = [
        ['From', formatAddress(from, fromName)],
        ['To', to],
        ['Subject', encodeHeaderWord(assertNoCrlf('Subject', subject))],
        ['Date', formatMailDate(date)],
        ['Message-ID', assertNoCrlf('Message-ID', messageId)],
        ['MIME-Version', '1.0'],
        ['Auto-Submitted', 'auto-generated'],
    ];
    const extra = Object.entries(extraHeaders).map(([name, value]) => [
        assertNoCrlf('header name', name),
        assertNoCrlf(name, value),
    ]);
    const headers = [...base, ...extra, ['Content-Type', `multipart/alternative; boundary="${boundary}"`]];

    const body = [
        mimePart(boundary, 'text/plain', text),
        mimePart(boundary, 'text/html', html),
        `--${boundary}--`,
        '',
    ].join(CRLF);

    return `${renderHeaders(headers)}${CRLF}${CRLF}${body}`;
}
