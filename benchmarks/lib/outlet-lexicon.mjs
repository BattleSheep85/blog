// outlet-lexicon.mjs — deterministic outlet (publication) recognition for the
// corrected grounding checker (benchmarks/lib/grounding-check.mjs).
//
// Split out of grounding-check.mjs to keep that file under the 400-line cap
// the corrected-scoring spec sets (docs/benchmark-validity-audit.md section
// 6.1). Pure string/date code, no I/O, no LLM.
//
// Two jobs:
//   1. Turn a corpus source list into a lexicon of outlet tokens that really
//      exist, each with the source indexes and dates that back it.
//   2. Find outlet names and nearby dates inside report prose, with spans, so
//      every verdict a human reads can be audited in seconds.

import { norm } from './synth-score.mjs';

export const reEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Multi-word or renamed outlets whose written form does not match their host
// token. Maps a written surface form to the canonical token the host lexicon
// uses. Kept small and explicit on purpose: a closed vocabulary cannot invent
// an outlet, and every entry here is one a stored report actually writes.
export const OUTLET_ALIASES = Object.freeze({
  'what hi fi': 'whathifi',
  'what hifi': 'whathifi',
  'consumer reports': 'consumerreports',
  'toms guide': 'tomsguide',
  'tom s guide': 'tomsguide',
  'toms hardware': 'tomshardware',
  'tom s hardware': 'tomshardware',
  wirecutter: 'nytimes',
  'new york times': 'nytimes',
  'digital trends': 'digitaltrends',
  'good housekeeping': 'goodhousekeeping',
  'pc gamer': 'pcgamer',
  'pc mag': 'pcmag',
  'ars technica': 'arstechnica',
  'bon appetit': 'bonappetit',
  'serious eats': 'seriouseats',
  'the verge': 'theverge',
  'the spruce': 'thespruce',
  'hardware busters': 'hwbusters',
  'gamers nexus': 'gamersnexus',
  'hardware unboxed': 'hardwareunboxed',
  'trusted reviews': 'trustedreviews',
  'expert reviews': 'expertreviews',
  'tech advisor': 'techadvisor',
  'business insider': 'businessinsider',
  'washington post': 'washingtonpost',
  'best buy': 'bestbuy',
  'home depot': 'homedepot',
  'sound guys': 'soundguys',
  'head fi': 'headfi',
  'the guardian': 'theguardian',
  'popular mechanics': 'popularmechanics',
  'real simple': 'realsimple',
  'america s test kitchen': 'americastestkitchen',
});

const MULTI_PART_TLD_HEADS = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
const HOST_PREFIXES = new Set(['www', 'm', 'amp', 'en', 'us', 'uk']);

// A derived token that is a bare number (a year in a title tail, "… - 2026") or
// a generic page word names no publication. Left in, "2026" matched every date
// in every report and produced 33 bogus date-mismatch flags on the first run.
const GENERIC_TOKENS = new Set([
  'home', 'best', 'top', 'news', 'blog', 'shop', 'store', 'help', 'support',
  'review', 'reviews', 'product', 'products', 'index', 'page', 'guide', 'guides',
  'deals', 'buy', 'search', 'article', 'articles', 'post', 'posts', 'category',
]);
export const isUsableOutletToken = (token) => Boolean(token)
  && token.length >= 3
  && !/^\d+$/.test(token)
  && !GENERIC_TOKENS.has(token);

// Hostname -> single canonical token. "www.rtings.com" -> "rtings",
// "www.bbc.co.uk" -> "bbc". Returns null when nothing usable is left.
export function hostToken(url) {
  let host = '';
  try { host = new URL(String(url || '')).hostname.toLowerCase(); } catch { return null; }
  const parts = host.split('.').filter(Boolean);
  while (parts.length > 2 && HOST_PREFIXES.has(parts[0])) parts.shift();
  if (parts.length < 2) return parts[0] || null;
  const headIdx = MULTI_PART_TLD_HEADS.has(parts[parts.length - 2]) && parts.length >= 3
    ? parts.length - 3
    : parts.length - 2;
  const token = norm(parts[headIdx]).replace(/ /g, '');
  return token.length >= 2 ? token : null;
}

// Outlet names also live in the title tail: "… of 2026 - RTINGS.com".
function titleTailTokens(title) {
  const tail = String(title || '').split(/\s+[-|]\s+/).slice(1).pop();
  if (!tail) return [];
  const cleaned = norm(tail).replace(/\b(com|net|org|co uk)\b/g, ' ').trim();
  if (!cleaned) return [];
  const joined = cleaned.replace(/ /g, '');
  const aliased = OUTLET_ALIASES[cleaned];
  return [aliased || (joined.length >= 3 ? joined : null)].filter(Boolean);
}

const MS_PER_DAY = 86400000;
const BRACKET_DATE = /^\[([A-Za-z]{3,9}\.? \d{1,2}, \d{4})\]/;

// Source date as YYYY-MM-DD. publishedAt (epoch seconds) is authoritative and
// agrees with the bracketed content date on every source measured (6074/6074),
// so the bracket is a fallback only.
export function sourceDateISO(source) {
  if (Number.isFinite(source?.publishedAt) && source.publishedAt > 0) {
    return new Date(source.publishedAt * 1000).toISOString().slice(0, 10);
  }
  const m = BRACKET_DATE.exec(String(source?.content || ''));
  if (!m) return null;
  const t = Date.parse(`${m[1]} UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

// corpusSources -> Map<token, { hostToken, sourceIdxs, dates }>. Frozen entries
// so no caller can mutate the shared lexicon.
export function buildOutletLexicon(sources) {
  const lexicon = new Map();
  const add = (token, idx, dateISO) => {
    if (!token) return;
    const prev = lexicon.get(token);
    const next = prev
      ? { hostToken: prev.hostToken, sourceIdxs: [...prev.sourceIdxs, idx], dates: dateISO ? [...prev.dates, dateISO] : prev.dates }
      : { hostToken: token, sourceIdxs: [idx], dates: dateISO ? [dateISO] : [] };
    lexicon.set(token, next);
  };
  (sources || []).forEach((s, idx) => {
    const dateISO = sourceDateISO(s);
    const host = hostToken(s?.url);
    if (isUsableOutletToken(host)) add(host, idx, dateISO);
    for (const t of titleTailTokens(s?.title)) if (isUsableOutletToken(t)) add(t, idx, dateISO);
  });
  return lexicon;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const DATE_PATTERNS = [
  { re: new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'), order: 'mdy' },
  { re: new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE},?\\s+(\\d{4})\\b`, 'gi'), order: 'dmy' },
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, order: 'iso' },
];

const pad = (n) => String(n).padStart(2, '0');

const isoFromMatch = (m, order) => {
  if (order === 'iso') return `${m[1]}-${m[2]}-${m[3]}`;
  const monthIdx = MONTHS.indexOf((order === 'mdy' ? m[1] : m[2]).slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;
  const day = order === 'mdy' ? m[2] : m[1];
  return `${m[3]}-${pad(monthIdx + 1)}-${pad(Number(day))}`;
};

// Every date in `text`, with its span. Supports the four formats the stored
// reports actually use: "May 14 2026", "May 14, 2026", "14 May 2026",
// "2026-05-14". Sorted by position, deduplicated by start offset.
export function findDates(text) {
  const s = String(text || '');
  const byStart = new Map();
  for (const { re, order } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      const iso = isoFromMatch(m, order);
      if (iso && !byStart.has(m.index)) byStart.set(m.index, { iso, start: m.index, end: m.index + m[0].length });
    }
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

// First date in `window`, as YYYY-MM-DD, or null.
export function findDate(window) {
  return findDates(window)[0]?.iso ?? null;
}

export function daysApart(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(a - b) / MS_PER_DAY;
}
