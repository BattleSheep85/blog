// Pure-ML extraction engine — analysis pipeline (Phase 0).
// sources(+credibility) + notes  →  ranked products with grounded facts + pros/cons.
// 100% hand-rolled, zero deps, Worker-compatible. Every emitted value is a span that
// exists in a source — fabrication is impossible by construction.

import { VALENCE, NEGATORS, INTENSIFIERS, MARKETING } from './lexicon.js';
import { BRANDS, PUBLISHERS, STOPWORDS } from './gazetteer.js';

// Genres that can NEVER be the sole basis for a recommendation (mirrors the
// deterministic version of the synthesis prompt's credibility rules).
const NONCREDIBLE_GENRES = new Set(['listicle', 'affiliate-conflict', 'manufacturer']);
const MIN_CREDIBLE_SCORE = 45; // a product needs ≥1 supporting source at/above this AND of a credible genre

// ── text utils ───────────────────────────────────────────────────────────────
let _seg;
function sentences(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  try {
    _seg = _seg || new Intl.Segmenter('en', { granularity: 'sentence' });
    return [..._seg.segment(t)].map((s) => s.segment.trim()).filter(Boolean);
  } catch {
    return t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }
}
const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9'’#-]+/g) || [];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Split a sentence into clauses so a mixed "X is great but the bin is small" yields
// a separate pro AND con, and a comparison "A and B are best; C is value" separates.
const CLAUSE_SPLIT = /\s*(?:;|—|–|\bbut\b|\bthough\b|\bhowever\b|\bwhereas\b|\bwhile\b|\bexcept\b|\byet\b)\s+/i;
const clausesOf = (sentence) => String(sentence || '').split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean);

// ── candidate harvest ─────────────────────────────────────────────────────────
// Pull Title-Case product-name candidates from notes + source titles/content.
const TITLECASE_RUN = /\b([A-Z][A-Za-z]*(?:[''-][A-Za-z]+)?(?:\s+(?:[A-Z][A-Za-z0-9]*|[A-Z]{1,6}[-]?[A-Za-z0-9]*\d[A-Za-z0-9-]*|\d[A-Za-z0-9-]*|\([A-Za-z]+\)))*)\b/g;
const hasModelCode = (s) => /\b[A-Za-z]*\d[A-Za-z0-9-]*\b/.test(s) || /\b[A-Z]{2,}[-]?\d/.test(s);
const firstBrand = (toks) => {
  const l = toks.map((t) => t.toLowerCase());
  if (l.length >= 2 && BRANDS.has(`${l[0]} ${l[1]}`)) return `${toks[0]} ${toks[1]}`;
  if (BRANDS.has(l[0])) return toks[0];
  return null;
};

const YEAR_RE = /^(?:19|20)\d\d$/;
const anyBrand = (toks) => firstBrand(toks) || toks.some((t) => BRANDS.has(t.toLowerCase()));
const cleanTok = (t) => t.replace(/^[("'“]+|[)"'”.,;:]+$/g, '');

// All candidate name strings in one sentence: Title-Case runs + brand-led runs
// (the latter catches lowercase brands like "eufy", "iRobot").
function extractNames(sent) {
  const out = [];
  let m; TITLECASE_RUN.lastIndex = 0;
  while ((m = TITLECASE_RUN.exec(sent)) !== null) out.push(m[1].trim());
  const toks = sent.split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const l1 = cleanTok(toks[i]).toLowerCase();
    const l2 = cleanTok(toks[i + 1] || '').toLowerCase();
    let span = 0;
    if (l1 && l2 && BRANDS.has(`${l1} ${l2}`)) span = 2;
    else if (BRANDS.has(l1)) span = 1;
    if (!span) continue;
    const parts = toks.slice(i, i + span).map(cleanTok);
    for (let j = i + span; j < toks.length && j < i + span + 3; j++) {
      const t = cleanTok(toks[j]);
      if (/^[A-Z]/.test(t) || /\d/.test(t)) parts.push(t); else break;
    }
    out.push(parts.join(' '));
  }
  return out;
}

function harvestCandidates(sources, notes) {
  const units = [];
  notes.forEach((n) => units.push({ text: n.content || '', src: null }));
  sources.forEach((s, i) => { units.push({ text: `${s.title || ''}. ${s.content || ''}`, src: i }); });

  const cands = new Map();
  for (const u of units) {
    for (const sent of sentences(u.text)) {
      for (const raw of extractNames(sent)) {
        let toks = raw.split(/\s+/).map(cleanTok).filter(Boolean);
        // strip leading stopword/publisher/number/year tokens; trailing stopword/year
        while (toks.length && (STOPWORDS.has(toks[0].toLowerCase()) || PUBLISHERS.has(toks[0].toLowerCase()) || /^\d+$/.test(toks[0]) || YEAR_RE.test(toks[0]))) toks.shift();
        while (toks.length && (STOPWORDS.has(toks[toks.length - 1].toLowerCase()) || YEAR_RE.test(toks[toks.length - 1]))) toks.pop();
        if (!toks.length) continue;
        const name = toks.join(' ');
        const low = name.toLowerCase();
        if (low.length < 3 || PUBLISHERS.has(low) || toks.every((t) => STOPWORDS.has(t.toLowerCase()))) continue;
        const brand = anyBrand(toks);
        const code = hasModelCode(name);
        // KEEP RULE: a real product has a known brand OR a model code. This drops
        // category/headline noise ("Office Chairs", "10 Best Robot Vacuums") which
        // have neither — and a fabricated trap with neither never even enters.
        if (!brand && !code) continue;
        const key = norm(name);
        if (!cands.has(key)) cands.set(key, { name, toks, brand: firstBrand(toks), hasCode: code, srcIdx: new Set(), sents: [] });
        const c = cands.get(key);
        if (u.src != null) c.srcIdx.add(u.src);
        c.sents.push({ idx: u.src, sentence: sent });
      }
    }
  }
  return [...cands.values()];
}

// ── entity resolution (conservative — under-merge beats over-merge) ────────────
const modelToken = (toks) => toks.find((t) => /\d/.test(t))?.toLowerCase() || null;
function resolveCandidates(cands) {
  // sort longest-name first so codes fold into full names
  const sorted = [...cands].sort((a, b) => b.name.length - a.name.length);
  const kept = [];
  for (const c of sorted) {
    const cCode = modelToken(c.toks);
    let merged = false;
    for (const k of kept) {
      const kCode = modelToken(k.toks);
      // merge ONLY on safe signals: one name contains the other, OR identical model code
      const contains = norm(k.name).includes(norm(c.name)) || norm(c.name).includes(norm(k.name));
      const sameCode = cCode && kCode && cCode === kCode;
      // HARD no-merge if both have model codes that differ (RK84 ≠ RK87)
      const codeConflict = cCode && kCode && cCode !== kCode;
      if (!codeConflict && (sameCode || (contains && (!cCode || !kCode || cCode === kCode)))) {
        k.aliases = k.aliases || [];
        if (!k.aliases.includes(c.name)) k.aliases.push(c.name);
        c.srcIdx.forEach((i) => k.srcIdx.add(i));
        k.sents.push(...c.sents);
        merged = true;
        break;
      }
    }
    if (!merged) { c.aliases = []; kept.push(c); }
  }
  return kept;
}

// ── sentiment ──────────────────────────────────────────────────────────────────
function sentencePolarity(sentence) {
  const toks = words(sentence);
  let score = 0, hits = 0;
  for (let i = 0; i < toks.length; i++) {
    const v = VALENCE[toks[i]];
    if (v === undefined) continue;
    let s = v;
    const prev = toks[i - 1] || '';
    if (INTENSIFIERS[prev]) s *= INTENSIFIERS[prev];
    // negation in the preceding 3 tokens flips
    for (let j = Math.max(0, i - 3); j < i; j++) if (NEGATORS.has(toks[j])) { s = -s * 0.9; break; }
    score += s; hits++;
  }
  return { score, hits };
}

// ── per-product facts + pros/cons from its supporting sentences ────────────────
const PRICE_RE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/g;
const SPEC_RE = /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s?(ms|hz|nits|mb\/s|gb\/s|tb\/s|gb|tb|mah|wh|watts?|w|mm|cm|"|inch(?:es)?|hours?|hrs?|kg|lbs?|delta-e|%)\b/gi;

function aliasMatchers(c) {
  const names = [c.name, ...(c.aliases || [])];
  const code = modelToken(c.toks);
  if (code && code.length >= 3) names.push(code);
  return names.map((n) => n.toLowerCase());
}

function analyzeProduct(c, sources, otherMatchers = [], seen = new Set()) {
  const matchers = aliasMatchers(c);
  // supporting sources: those whose text mentions a matcher
  const support = [];
  sources.forEach((s, i) => {
    const hay = `${s.title || ''} ${s.content || ''}`.toLowerCase();
    if (matchers.some((m) => hay.includes(m))) {
      support.push({ i, score: s.credibility?.score ?? 0, tags: s.credibility?.tags || [], source: s });
    }
  });
  // sentences (from notes+sources) that mention the product
  const proConSents = [];
  for (const sent of c.sents) {
    const low = sent.sentence.toLowerCase();
    if (!matchers.some((m) => low.includes(m))) continue;
    const cred = sent.idx != null ? (sources[sent.idx]?.credibility?.score ?? 40) : 50;
    const genre = sent.idx != null ? (sources[sent.idx]?.credibility?.tags || []) : ['note'];
    proConSents.push({ sentence: sent.sentence, cred, genre, srcIdx: sent.idx });
  }

  // price: only $ amounts that actually appear in supporting text → median (grounded)
  const prices = [];
  for (const s of support) for (const m of `${s.source.content || ''}`.matchAll(PRICE_RE)) {
    const ctx = s.source.content.toLowerCase();
    // skip discount phrasing ("$50 off", "save $50")
    const at = m.index || 0; const before = ctx.slice(Math.max(0, at - 12), at);
    if (/\b(off|save|saving|discount|coupon)\b/.test(before) || /\boff\b/.test(ctx.slice(at, at + 20))) continue;
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (n >= 1 && n <= 50000) prices.push(n);
  }
  prices.sort((a, b) => a - b);
  const price = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  // specs: number+unit pairs from supporting text
  const specs = {};
  for (const s of support) for (const m of `${s.source.content || ''}`.matchAll(SPEC_RE)) {
    const unit = m[2].toLowerCase();
    if (!specs[unit]) specs[unit] = `${m[1]}${/^[a-z%"]/.test(unit) ? ' ' : ' '}${m[2]}`.trim();
  }

  // pros/cons: CLAUSE-level + single-product ATTRIBUTION (the #1 honesty fix).
  // A comparison sentence ("A and B are best; C is value") is split, and a clause is
  // credited to this product only when the clause is about it and names no rival.
  const otherIn = (txt) => otherMatchers.some((m) => txt.toLowerCase().includes(m));
  const selfIn = (txt) => matchers.some((m) => txt.toLowerCase().includes(m));
  const pros = [], cons = [];
  for (const ps of proConSents) {
    const sentHasRival = otherIn(ps.sentence);
    for (const clause of clausesOf(ps.sentence)) {
      const clean = clause.replace(/\s+/g, ' ').trim();
      if (clean.length < 12 || clean.length > 220) continue;
      // multi-product sentence: keep only clauses that name THIS product and no rival.
      // single-product sentence: all its clauses attribute here (carries the "but …" con).
      if (sentHasRival && (!selfIn(clean) || otherIn(clean))) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue; // never reuse the same clause across products
      const { score, hits } = sentencePolarity(clean);
      if (!hits) continue;
      if (score >= 0.8) { pros.push({ text: clean, score, cred: ps.cred }); seen.add(key); }
      else if (score <= -0.6) { cons.push({ text: clean, score, cred: ps.cred }); seen.add(key); } // cons scarce + validate-required → more sensitive
    }
  }
  // Recall fallback: a legit, credibly-sourced product mentioned ONLY in comparisons
  // (e.g. "A and B are the best picks") would otherwise lose every clause and be
  // dropped — and dropping a real product is itself a lie. Allow ONE comparative
  // clause that positively names it (deduped), so it still appears honestly.
  if (pros.length === 0) {
    for (const ps of proConSents) {
      let done = false;
      for (const clause of clausesOf(ps.sentence)) {
        const clean = clause.replace(/\s+/g, ' ').trim();
        if (clean.length < 12 || clean.length > 220 || !selfIn(clean) || seen.has(clean.toLowerCase())) continue;
        const { score, hits } = sentencePolarity(clean);
        if (hits && score >= 0.8) { pros.push({ text: clean, score, cred: ps.cred }); seen.add(clean.toLowerCase()); done = true; break; }
      }
      if (done) break;
    }
  }
  return { support, price, specs, pros, cons }; // pros/cons are RAW scored clauses
}

// rank/dedup the scored clauses into the final text list
const pick = (arr, sign) => arr.sort((a, b) => sign * (b.score - a.score) || b.cred - a.cred)
  .filter((x, i, a) => a.findIndex((y) => y.text === x.text) === i).slice(0, 4).map((x) => x.text);

// ── rating (deterministic, auditable) ──────────────────────────────────────────
// Rate from the CLEAN attributed clauses (not raw comparative sentences, which used
// to inflate thin products to 5/5) + an evidence cap so a product with little
// credible backing can't top out. Editorial 0-5; never invented precision.
function rate(pros, cons, credibleCount) {
  let wSum = 0, wPol = 0;
  for (const x of [...pros, ...cons]) {
    const w = Math.max(0.2, x.cred / 100);
    wSum += w; wPol += w * Math.max(-3, Math.min(3, x.score));
  }
  const C = 2.5, prior = 0.3;
  const meanPol = wSum > 0 ? wPol / wSum : 0;
  const shrunk = (wSum * meanPol + C * prior) / (wSum + C);
  const cap = 3.5 + 0.5 * Math.min(3, credibleCount); // 1 src→4.0, 2→4.5, ≥3→5.0
  const rating = Math.min(2.5 + shrunk * 1.3, cap);
  return Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2; // 0..5 in 0.5 steps
}

export function analyze(query, notes, sources) {
  const harvested = resolveCandidates(harvestCandidates(sources, notes || []));
  const allMatch = harvested.map((c) => ({ c, m: aliasMatchers(c) }));
  const seen = new Set(); // a given clause is used as a pro/con for at most ONE product
  const products = [];
  for (const c of harvested) {
    const others = allMatch.filter((x) => x.c !== c).flatMap((x) => x.m).filter((m) => m.length > 2);
    const a = analyzeProduct(c, sources, others, seen);
    // INCLUSION RULE (the trap-suppressor): keep only products with ≥1 credible,
    // non-listicle/affiliate/manufacturer supporting source. Fabricated traps are
    // backed ONLY by listicle/affiliate/manufacturer sources → excluded, honestly.
    const credible = a.support.filter((s) => s.score >= MIN_CREDIBLE_SCORE && !s.tags.every((t) => NONCREDIBLE_GENRES.has(t)));
    if (!credible.length) continue;
    // also require some real signal (a pro or a con) so we don't list a bare name
    if (a.pros.length === 0 && a.cons.length === 0) continue;
    const rating = rate(a.pros, a.cons, credible.length);
    const weight = credible.reduce((s, x) => s + x.score, 0); // credible evidence mass for ranking
    products.push({
      name: c.name, brand: c.brand || '', price: a.price, rating,
      pros: pick(a.pros, 1), cons: pick(a.cons, -1), specs: a.specs,
      productUrl: '', manufacturerUrl: '', imageUrl: '',
      verdict: '', bestFor: '', metadata: {},
      _credibleCount: credible.length, _nEff: Math.round(weight / 100 * 10) / 10, _weight: weight,
      _topGenres: [...new Set(a.support.flatMap((s) => s.tags))],
    });
  }
  // rank: weight (credible evidence mass) then rating
  products.sort((a, b) => b._weight - a._weight || b.rating - a.rating);
  products.forEach((p, i) => { p.rank = i + 1; });
  return products;
}

export { sentences, sentencePolarity, MARKETING };
