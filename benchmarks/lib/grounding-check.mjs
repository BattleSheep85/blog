// grounding-check.mjs — EXACT, deterministic grounding for synthesis reports.
//
// Why this file exists: every LLM-judged "is this product/number/citation real"
// verdict this repo ever recorded against a large corpus was produced by a judge
// that could see 0 to 19 percent of the sources. Three separate checking layers
// each called a REAL thing a fabrication (Seasonic TX-850, the 12-year warranty,
// the Epson ET-3950). See docs/benchmark-validity-audit.md.
//
// Rule this module enforces: every EXISTENCE question is answered by tested code
// against the FULL corpus, never by a language model. The LLM judge downstream is
// asked only what needs an opinion (usefulness, evidence discipline).
//
// Pure. No I/O, no network, no mutation of inputs.

import { nums, close, norm, NAME_STOP } from './synth-score.mjs';
import { BRANDS } from '../../worker/engine/extract/gazetteer.js';
import { buildOutletLexicon, sourceDateISO, daysApart, reEscape } from './outlet-lexicon.mjs';
import { scanCitations } from './citation-scan.mjs';

export { NAME_STOP };

export const DATE_TOLERANCE_DAYS = 3;
export const PRESENT_RATIO_MIN = 0.5;   // kept from the 2026-07-11 name_ung fix
export const WEIGHT_PRODUCT = 3;
export const WEIGHT_CITATION = 2;
export const WEIGHT_NUMBER = 1;

// ── haystacks ────────────────────────────────────────────────────────────────

const noSpace = (s) => s.replace(/ /g, '');

// One per corpus, reused across every report scored against it.
export function buildHaystacks(corpus) {
  const sources = corpus?.sources || [];
  const notes = corpus?.notes || [];
  const parts = [
    ...sources.map((s) => `${s.title || ''} ${s.content || ''}`),
    ...notes.map((n) => n.content || ''),
  ];
  const text = parts.map(norm).join(' ');
  const rawText = parts.join(' ');
  const views = sources.map((s, idx) => ({
    idx,
    title: s.title || '',
    raw: `${s.title || ''} ${s.content || ''}`,
    titleNorm: norm(s.title),
    contentNorm: norm(s.content),
    dateISO: sourceDateISO(s),
    tags: s?.credibility?.tags || [],
  }));
  return Object.freeze({
    text,
    textNoSpace: noSpace(text),
    rawText,
    srcNums: nums(rawText),
    outlets: buildOutletLexicon(sources),
    views,
    noteTexts: notes.map((n) => n.content || ''),
  });
}

const hayFor = (corpus, opts) => opts?.hay || buildHaystacks(corpus);

// ── product names ────────────────────────────────────────────────────────────

const isDigitBearing = (tok) => /\d/.test(tok);
// length >= 3, OR length 2 with a digit. The second clause closes the recorded
// short-SKU gap (issues.md 2026-07-24): "V3" used to skip the check entirely.
const isSignificant = (tok) => (tok.length >= 3 || (tok.length === 2 && isDigitBearing(tok))) && !NAME_STOP.has(tok);

// The space-stripped haystack exists to match formatting variants ("V15Detect"
// vs "V15 Detect"). Left unguarded it also GLUES two unrelated numbers into a
// third one: "ET-3950 $399.99" collapses to "et395039999", which contains
// "9999" and silently grounds a fabricated "ET-9999". Caught by assertion 1 of
// the test suite. A token that starts or ends with a digit must therefore land
// on a non-digit boundary in the joined text.
function noSpaceHit(tok, textNoSpace) {
  if (!/^\d/.test(tok) && !/\d$/.test(tok)) return textNoSpace.includes(tok);
  const lead = /^\d/.test(tok) ? '(?<!\\d)' : '';
  const tail = /\d$/.test(tok) ? '(?!\\d)' : '';
  return new RegExp(`${lead}${reEscape(tok)}${tail}`).test(textNoSpace);
}

export function checkProductName(name, hay) {
  const n = norm(name);
  const strict = n.length >= 4 && hay.text.includes(n);
  const tokens = n.split(' ').filter(isSignificant).map((tok) => ({
    tok,
    // Plain substring on `text` is kept deliberately: it is the audited
    // name_ung semantics from the 2026-07-11 fix. It is lenient (a fabricated
    // "399" matches inside "3990"), which errs toward missing a fabrication
    // rather than inventing one. That is the safe direction for this module.
    present: hay.text.includes(tok) || noSpaceHit(tok, hay.textNoSpace),
    digitBearing: isDigitBearing(tok),
    isBrand: BRANDS.has(tok),
  }));
  if (tokens.length === 0) return { grounded: true, strict, tokens, presentRatio: 1, checkable: false };
  const presentRatio = tokens.filter((t) => t.present).length / tokens.length;
  const modelNumbersOk = tokens.filter((t) => t.digitBearing).every((t) => t.present);
  return {
    grounded: modelNumbersOk && presentRatio >= PRESENT_RATIO_MIN,
    strict,
    tokens,
    presentRatio,
    checkable: true,
  };
}

// ── numbers ──────────────────────────────────────────────────────────────────

// Exact same semantics as the price+specs loops in synth-score.mjs score().
// The test suite pins sum(ungrounded) === score().num_ung so this cannot drift.
export function checkNumbers(product, hay) {
  const ungrounded = [];
  let checked = 0;
  const isGrounded = (x) => hay.srcNums.some((s) => close(x, s));
  if (typeof product?.price === 'number') {
    checked += 1;
    if (!isGrounded(product.price)) ungrounded.push({ field: 'price', value: product.price, number: product.price });
  }
  for (const [field, v] of Object.entries(product?.specs || {})) {
    for (const x of nums(String(v))) {
      checked += 1;
      if (!isGrounded(x)) ungrounded.push({ field, value: v, number: x });
    }
  }
  return { checked, ungrounded };
}

// ── citations ────────────────────────────────────────────────────────────────

// The scanner itself lives in citation-scan.mjs. This file keeps the spec API.
export const extractCitations = scanCitations;

export function checkCitations(citations, hay) {
  return citations.map((c) => {
    const entry = hay.outlets.get(c.outlet);
    if (!entry) return { ...c, status: 'outlet-missing', matchedSourceIdx: null };
    if (!c.dateISO) return { ...c, status: 'verified', matchedSourceIdx: entry.sourceIdxs[0] ?? null };
    // An outlet whose corpus sources carry no date at all (Reddit, Instagram)
    // cannot fail a date check. Calling that a mismatch punishes the report for
    // a gap in the gatherer's metadata.
    if (entry.dates.length === 0) return { ...c, status: 'verified', matchedSourceIdx: entry.sourceIdxs[0] ?? null };
    const hitIdx = entry.sourceIdxs.find((idx) => {
      const d = hay.views[idx]?.dateISO;
      return d && daysApart(d, c.dateISO) <= DATE_TOLERANCE_DAYS;
    });
    return hitIdx === undefined
      ? { ...c, status: 'date-mismatch', matchedSourceIdx: entry.sourceIdxs[0] ?? null }
      : { ...c, status: 'verified', matchedSourceIdx: hitIdx };
  });
}

// ── report prose ─────────────────────────────────────────────────────────────

// Fields the spec names: summary, verdicts, pros, cons, metadata.sourceDate.
export function collectProse(report) {
  const segments = [];
  if (report?.summary) segments.push({ field: 'summary', text: String(report.summary) });
  (report?.products || []).forEach((p, i) => {
    const at = (sub) => `products[${i}].${sub}`;
    if (p?.verdict) segments.push({ field: at('verdict'), text: String(p.verdict) });
    (p?.pros || []).forEach((t, j) => segments.push({ field: at(`pros[${j}]`), text: String(t) }));
    (p?.cons || []).forEach((t, j) => segments.push({ field: at(`cons[${j}]`), text: String(t) }));
    if (p?.metadata?.sourceDate) segments.push({ field: at('metadata.sourceDate'), text: String(p.metadata.sourceDate) });
  });
  return segments;
}

// ── composite deterministic grounding ────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;
// A citation only scores when it is really used as a citation. A bare prose
// mention of an outlet word is recorded and ignored, so brand-word prose can
// never manufacture a fabrication flag.
export const isScorableCitation = (c) => c.citationPosition || Boolean(c.dateISO);

export function groundingCheck(report, corpus, opts = {}) {
  const hay = hayFor(corpus, opts);
  const productList = report?.products || [];
  const products = productList.map((p) => ({ name: p?.name || '', ...checkProductName(p?.name || '', hay) }));
  const numberChecks = productList.map((p) => ({ product: p?.name || '', ...checkNumbers(p, hay) }));
  const numbers = numberChecks.flatMap((c) => c.ungrounded.map((u) => ({ product: c.product, ...u })));
  const numberCount = numberChecks.reduce((sum, c) => sum + c.checked, 0);
  const reportNameTokens = new Set(products.flatMap((p) => p.tokens.map((t) => t.tok)));
  const citations = checkCitations(extractCitations(collectProse(report), hay, { reportNameTokens }), hay);
  const scorable = citations.filter(isScorableCitation);

  const total = products.length * WEIGHT_PRODUCT + scorable.length * WEIGHT_CITATION + numberCount * WEIGHT_NUMBER;
  const citationCredit = scorable.reduce((sum, c) => {
    if (c.status === 'verified') return sum + WEIGHT_CITATION;
    return c.status === 'date-mismatch' ? sum + WEIGHT_CITATION / 2 : sum;
  }, 0);
  const grounded = products.filter((p) => p.grounded).length * WEIGHT_PRODUCT
    + citationCredit
    + (numberCount - numbers.length) * WEIGHT_NUMBER;

  return {
    gDet: total > 0 ? round2(10 * (grounded / total)) : null,
    units: { products, numbers: { checked: numberCount, ungrounded: numbers }, citations },
    fabricatedProducts: products.filter((p) => !p.grounded),
    fabricatedCitations: scorable.filter((c) => c.status !== 'verified'),
    ungroundedNumbers: numbers,
    strictMisses: products.filter((p) => !p.strict && p.checkable).map((p) => p.name),
    weights: { grounded: round2(grounded), total },
  };
}

// ── evidence table for the v2 judge bundle ───────────────────────────────────

const EVIDENCE_DEFAULTS = Object.freeze({ perProduct: 3, snippetChars: 300, capChars: 14000 });

const relevance = (view, tokens) => tokens.reduce((sum, t) => {
  const hit = (view.titleNorm.includes(t.tok) ? 3 : 0) + (view.contentNorm.includes(t.tok) ? 1 : 0);
  return sum + (t.digitBearing ? hit * 2 : hit);
}, 0);

function snippetFor(view, tokens, snippetChars) {
  const lower = view.raw.toLowerCase();
  const at = tokens.map((t) => lower.indexOf(t.tok)).filter((i) => i >= 0);
  const centre = at.length ? Math.min(...at) : 0;
  const start = Math.max(0, centre - Math.floor(snippetChars / 2));
  return view.raw.slice(start, start + snippetChars).replace(/\s+/g, ' ').trim();
}

export function buildEvidenceTable(report, corpus, options = {}) {
  const { perProduct, snippetChars, capChars } = { ...EVIDENCE_DEFAULTS, ...options };
  const hay = hayFor(corpus, options);
  const perProductOut = {};
  let used = 0;
  let truncated = false;
  for (const p of report?.products || []) {
    const tokens = checkProductName(p?.name || '', hay).tokens;
    const ranked = hay.views
      .map((view) => ({ view, score: relevance(view, tokens) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => (b.score - a.score) || (a.view.idx - b.view.idx))
      .slice(0, perProduct);
    const rows = [];
    for (const { view } of ranked) {
      const row = {
        sourceIdx: view.idx,
        title: view.title,
        date: view.dateISO,
        tag: view.tags.join('/') || 'untagged',
        snippet: snippetFor(view, tokens, snippetChars),
      };
      const cost = JSON.stringify(row).length;
      if (used + cost > capChars) { truncated = true; break; }
      used += cost;
      rows.push(row);
    }
    perProductOut[p?.name || '(unnamed)'] = rows;
    if (truncated) break;
  }
  return { perProduct: perProductOut, truncated, chars: used };
}
