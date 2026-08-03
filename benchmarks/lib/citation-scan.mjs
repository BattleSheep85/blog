// citation-scan.mjs — finds outlet citations and their dates inside report
// prose. Split out of grounding-check.mjs to keep that file under the 400-line
// cap the corrected-scoring spec sets (docs/benchmark-validity-audit.md 6.1).
//
// Two scans, both deterministic:
//   1. CLOSED vocabulary: outlet tokens the corpus really contains, plus a
//      static alias map. A closed scan cannot invent an outlet.
//   2. OPEN capture: a capitalised phrase after a strong citation cue, or in a
//      dated parenthetical, that the closed vocabulary does not know AND the
//      corpus never mentions anywhere. This is how a wholly invented outlet is
//      caught.
//
// Every guard below was added because it removed a REAL false positive from the
// first deterministic re-score of the 64 stored reports. Pure, no I/O.

import { norm } from './synth-score.mjs';
import { BRANDS } from '../../worker/engine/extract/gazetteer.js';
import { OUTLET_ALIASES, findDate, findDates, reEscape } from './outlet-lexicon.mjs';

export const DATE_WINDOW_CHARS = 48;
export const CUE_LOOKBACK_CHARS = 24;

const CUE_WORDS = 'per|according to|reported by|reviewed by|tested by|cited by|measured by|via|source|sources';
const CUE_BEFORE = new RegExp(`\\b(?:${CUE_WORDS}|by|from)\\s*$`, 'i');
// The OPEN capture drops the weak cues "by", "from" and "via" on purpose. They
// introduce technology, not publications ("via MagSafe wireless, USB-C PD"),
// and on the first re-score they produced every one of the invented-outlet
// false positives. Strong cues only. A known outlet written as "by RTINGS" is
// still caught, by the closed vocabulary path.
const OPEN_CUE_WORDS = 'per|according to|reported by|reviewed by|tested by|cited by|measured by';
const UNKNOWN_CUE = new RegExp(`\\b(?:${OPEN_CUE_WORDS})\\s+([A-Z][A-Za-z'&.\\-]*(?:\\s+[A-Z][A-Za-z'&.\\-]*){0,3})`, 'g');
const PAREN_CLAUSE = /\(([^)]{3,120})\)/g;
const PROPER_PHRASE = /^([A-Z][A-Za-z'&.\-]*(?:\s+[A-Z][A-Za-z'&.\-]*){0,3})/;
// Words that look like a proper noun in citation position but never name an outlet.
const NOT_AN_OUTLET = new Set([
  'the', 'this', 'that', 'our', 'their', 'its', 'it', 'we', 'us', 'one', 'two', 'all', 'most',
  'some', 'many', 'both', 'best', 'top', 'new', 'other', 'several', 'each', 'every', 'however',
  'note', 'evidence', 'review', 'reviews', 'users', 'owners', 'buyers', 'testers', 'experts',
  'expert', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul',
  'aug', 'sep', 'oct', 'nov', 'dec', 'amazon', 'walmart', 'target',
]);

const noSpace = (s) => s.replace(/ /g, '');
const phraseToken = (phrase) => {
  const n = norm(phrase);
  return OUTLET_ALIASES[n] || noSpace(n);
};

const surfaceRegex = (surface) => {
  const chunks = norm(surface).split(' ').filter(Boolean).map(reEscape);
  return chunks.length ? new RegExp(`(?<![a-z0-9])${chunks.join('[^a-z0-9]{1,3}')}(?![a-z0-9])`, 'gi') : null;
};

// Surface form -> canonical token, from the corpus lexicon plus the alias map.
function knownSurfaces(hay) {
  const out = new Map();
  for (const token of hay.outlets.keys()) out.set(token, token);
  for (const [surface, token] of Object.entries(OUTLET_ALIASES)) {
    out.set(surface, token);
    out.set(token, token);
  }
  return out;
}

export const proseSegments = (reportProse) => (Array.isArray(reportProse)
  ? reportProse.filter((s) => s && typeof s.text === 'string')
  : [{ field: 'prose', text: String(reportProse || '') }]);

const windowAround = (text, start, end) => text.slice(Math.max(0, start - DATE_WINDOW_CHARS), Math.min(text.length, end + DATE_WINDOW_CHARS));

const inParens = (text, start) => {
  const open = text.lastIndexOf('(', start);
  if (open < 0) return false;
  const closed = text.indexOf(')', start);
  return closed > start && text.slice(open, start).indexOf(')') < 0;
};

const citationPositionAt = (text, start) => inParens(text, start)
  || CUE_BEFORE.test(text.slice(Math.max(0, start - CUE_LOOKBACK_CHARS), start));

function knownHits(segment, surfaces) {
  const hits = [];
  for (const [surface, token] of surfaces) {
    const re = surfaceRegex(surface);
    if (!re) continue;
    let m;
    while ((m = re.exec(segment.text)) !== null) {
      hits.push({ token, alias: m[0], start: m.index, end: m.index + m[0].length, known: true });
    }
  }
  return hits;
}

// A phrase the corpus never mentions is the only thing the open path may flag.
// Longest prefix first, spaced against `text` at word boundaries and joined
// against `textNoSpace`, so "LA Times CES" clears on "latimes.com" and
// "Bon App" clears on "Bon Appétit". A single word under 4 characters does not
// count as a mention.
// ACCEPTED RESIDUAL: an invented outlet whose first word is a real corpus word
// ("Audio Weekly") clears too. This module chooses missed fabrications over
// invented ones. The audit exists because the reverse choice was made three
// times and was wrong three times.
function mentionedInCorpus(phrase, hay) {
  const words = norm(phrase).split(' ').filter(Boolean);
  for (let k = words.length; k >= 1; k -= 1) {
    const prefix = words.slice(0, k).join(' ');
    if (k === 1 && prefix.length < 4) continue;
    if (new RegExp(`(?<![a-z0-9])${reEscape(prefix)}(?![a-z0-9])`).test(hay.text)) return true;
    if (hay.textNoSpace.includes(noSpace(prefix))) return true;
  }
  return false;
}

const rejectPhrase = (phrase, reportNameTokens, hay) => {
  const token = phraseToken(phrase);
  const first = norm(phrase).split(' ')[0] || '';
  return token.length < 4 || /\d/.test(token) || NOT_AN_OUTLET.has(first)
    || BRANDS.has(first) || BRANDS.has(token) || reportNameTokens.has(first)
    || mentionedInCorpus(phrase, hay);
};

function unknownHits(segment, taken, reportNameTokens, hay) {
  const hits = [];
  const push = (phrase, start) => {
    if (!phrase || taken.some(([s, e]) => start < e && start + phrase.length > s)) return;
    if (rejectPhrase(phrase, reportNameTokens, hay)) return;
    hits.push({ token: phraseToken(phrase), alias: phrase, start, end: start + phrase.length, known: false });
  };
  let m;
  UNKNOWN_CUE.lastIndex = 0;
  while ((m = UNKNOWN_CUE.exec(segment.text)) !== null) push(m[1], m.index + m[0].indexOf(m[1]));
  PAREN_CLAUSE.lastIndex = 0;
  while ((m = PAREN_CLAUSE.exec(segment.text)) !== null) {
    if (!findDate(m[1])) continue;   // a parenthetical with no date is a spec, not a citation
    const pm = PROPER_PHRASE.exec(m[1].trim());
    if (pm) push(pm[1], m.index + 1 + m[1].indexOf(pm[1]));
  }
  return hits;
}

const gap = (hit, date) => {
  if (date.start >= hit.end) return (date.start - hit.end) - 0.5;   // "Outlet (May 14 2026)": the normal order, so prefer it
  if (hit.start >= date.end) return hit.start - date.end;           // "2026-06-12 Bon Appetit hands-on"
  return 0;
};

// One date belongs to ONE citation. "Wirecutter [Jan 28, 2026] and Bon Appetit
// [Jun 12, 2026], plus Reddit" used to give all three outlets the FIRST date in
// their window, which invented two date mismatches out of one real pairing.
function assignDates(hits, text) {
  const dates = findDates(text);
  const owner = new Map();
  for (const d of dates) {
    const best = hits.reduce((acc, h) => {
      const g = gap(h, d);
      return acc === null || g < acc.g ? { h, g } : acc;
    }, null);
    if (best && best.g <= DATE_WINDOW_CHARS) owner.set(d, best.h);
  }
  return new Map(hits.map((h) => {
    const mine = dates.filter((d) => owner.get(d) === h).sort((a, b) => gap(h, a) - gap(h, b));
    return [h, mine[0]?.iso ?? null];
  }));
}

function scanSegment(segment, surfaces, reportNameTokens, hay) {
  // A word that names a product IN THIS REPORT is a product mention, not a
  // citation, even when the manufacturer also runs a site in the corpus.
  // Without this, "parking mode with Viofo A329" was read as a VIOFO citation
  // and picked up an unrelated nearby date.
  const known = knownHits(segment, surfaces)
    .filter((h) => !reportNameTokens.has(h.token))
    .sort((a, b) => a.start - b.start);
  const taken = known.map((h) => [h.start, h.end]);
  const all = [...known, ...unknownHits(segment, taken, reportNameTokens, hay)].sort((a, b) => a.start - b.start);
  const dateOf = assignDates(all, segment.text);
  return all.map((h) => ({
    outlet: h.token,
    alias: h.alias,
    dateISO: dateOf.get(h),
    span: windowAround(segment.text, h.start, h.end).replace(/\s+/g, ' ').trim(),
    citationPosition: citationPositionAt(segment.text, h.start),
    field: segment.field,
    known: h.known,
  }));
}

export function scanCitations(reportProse, hay, opts = {}) {
  const surfaces = knownSurfaces(hay);
  const reportNameTokens = opts.reportNameTokens || new Set();
  return proseSegments(reportProse).flatMap((segment) => scanSegment(segment, surfaces, reportNameTokens, hay));
}
