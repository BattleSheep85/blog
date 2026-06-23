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
// Contrast markers introduce a drawback. A clause AFTER one carries a con even when a
// positive category word cancels the negative to a mild net score ("bulky for a
// portable speaker": bulky −1.3 + portable +1.2 ≈ −0.1).
const CONTRAST_RE = /\b(?:but|though|however|whereas|yet)\b/i;
function clausesWithContrast(sentence) {
  const s = String(sentence || '');
  const parts = s.split(CLAUSE_SPLIT);
  const markers = s.match(new RegExp(CLAUSE_SPLIT.source, 'gi')) || [];
  const out = [];
  let afterContrast = false;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && CONTRAST_RE.test(markers[i - 1] || '')) afterContrast = true;
    const t = parts[i].trim();
    if (t) out.push({ text: t, afterContrast });
  }
  return out;
}
// Tidy a clause for display: drop leading bullets/conjunctions/"label:" preambles and
// trailing punctuation. Only removes edge noise, so the core stays a verbatim source span.
function tidyClause(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
    .replace(/^[-–—•*\s]+/, '')
    .replace(/^[A-Z][A-Za-z ]{2,24}:\s+/, '')               // "Measured on our rig: …"
    .replace(/^(?:and|but|or|though|however|yet|so|because)\s+/i, '')
    .replace(/\s*[:|—-]\s*(?:r\/\w+|reddit|youtube|amazon(?:\.com)?|[A-Z][a-z]+\.(?:com|net|org|io)\b).*$/i, '') // source-attribution chrome tail
    .replace(/[,;:\-–—\s]+$/, '')
    .trim();
}
// A listicle HEADLINE / heading line (never a real pro/con). Conjunctive + bounded so a
// short Title-Case verdict that carries a real claim ("Best Battery Life In Its Class")
// is NOT rejected.
function looksLikeHeadline(clean) {
  const toks = clean.split(/\s+/);
  const noTerminal = !/[.!?]$/.test(clean);
  const titleRun = toks.length >= 4 && toks.filter((w) => /^[A-Z]/.test(w)).length / toks.length > 0.6;
  const listicleShape = /^(?:the\s+)?\d+\s+best\b/i.test(clean) || /\bbest\b[^.!?]*\bfor\b\s*(?:19|20)\d\d/i.test(clean);
  const hasClaim = (clean.toLowerCase().match(/[a-z0-9'’#-]+/g) || []).some((w) => VALENCE[w] !== undefined);
  return (listicleShape && noTerminal) || (noTerminal && titleRun && !hasClaim);
}
// HTML-entity decode — MUST run before any markdown stripping or clause splitting.
// Real jina/HTML content carries raw entities (&#9679;, &amp;, &#39;); left encoded
// they (a) surface as literal garbage in pros/names and (b) their embedded ';' makes
// the clause splitter cut a clause mid-word ("best low-end &amp" ). Decoding here is
// strictly corrective — it replaces an escape with its literal source character, or
// drops a DECORATIVE glyph (bullet/arrow/star/control) to a space; it never invents text.
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', bull: ' ', middot: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', deg: '°', trade: '™', reg: '®', copy: '©' };
const safeCp = (cp) => {
  if (!Number.isFinite(cp) || cp < 0x20) return ' ';
  if (cp >= 0x2022 && cp <= 0x2606) return ' '; // decorative bullets/arrows/stars → space (never a claim)
  try { return String.fromCodePoint(cp); } catch { return ' '; }
};
export const decodeEntities = (t) => String(t || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCp(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] ?? ' '));

// Real source content is jina MARKDOWN (links/images/headings) — strip it before any
// extraction so link/image/url syntax never leaks into product names or facts.
const stripMarkdown = (t) => decodeEntities(String(t || ''))
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // images
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → keep text, drop url
  .replace(/https?:\/\/\S+/g, ' ')         // bare urls
  .replace(/[#>*`|_~]+/g, ' ')             // md punctuation
  .replace(/\][([)\]]*/g, ' ')             // stray bracket/paren debris
  .replace(/\s+/g, ' ').trim();

// Category-relevance terms from the topical category + query head nouns. A real product
// for the query is discussed IN its category ("keyboard", "switches"); a cross-category
// entity that leaked from a mixed listicle (a laptop/shoe/vacuum in a keyboard query) is
// not. Used to drop those. Numbers, sizes, and generic qualifiers are excluded.
const CAT_STOP = new Set(['best', 'the', 'and', 'for', 'with', 'under', 'top', 'over', 'from', 'your', 'our', 'full', 'sized', 'size', 'layout', 'review', 'reviews', 'guide', 'cheap', 'budget', 'good', 'great', 'new', 'this', 'that', 'percent', 'inch', 'inches']);
function categoryTerms(cat, query) {
  const terms = new Set();
  const add = (w) => {
    const l = String(w).toLowerCase().replace(/[^a-z]/g, '');
    if (l.length >= 4 && !CAT_STOP.has(l)) { terms.add(l); terms.add(l.endsWith('s') ? l.slice(0, -1) : l + 's'); }
  };
  for (const w of `${cat || ''} ${query || ''}`.split(/\s+/)) add(w);
  return terms;
}
const inCategory = (c, support, terms) => {
  if (!terms.size) return true;
  // Include the SUPPORTING SOURCE TITLES — a legit pick's review page is titled for the
  // category ("Best Noise Cancelling Headphones - RTINGS") even when an individual
  // sentence about it doesn't repeat the noun; a cross-category leak's source is titled
  // for its OWN category (a shoe review), so it still fails the gate.
  const titles = (support || []).map((s) => s.source?.title || '').join(' ');
  const ctx = `${c.name} ${titles} ${(c.sents || []).map((s) => s.sentence).join(' ')}`.toLowerCase();
  for (const t of terms) if (ctx.includes(t)) return true;
  return false;
};

// ── candidate harvest ─────────────────────────────────────────────────────────
// Pull Title-Case product-name candidates from notes + source titles/content.
const TITLECASE_RUN = /\b([A-Z][A-Za-z]*(?:[''-][A-Za-z]+)?(?:\s+(?:[A-Z][A-Za-z0-9]*|[A-Z]{1,6}[-]?[A-Za-z0-9]*\d[A-Za-z0-9-]*|\d[A-Za-z0-9-]*|\([A-Za-z]+\)))*)\b/g;
const hasModelCode = (s) => /\b[A-Za-z]*\d[A-Za-z0-9-]*\b/.test(s) || /\b[A-Z]{2,}[-]?\d/.test(s);
// A STRONG model code has a letter ADJACENT to a digit (WF-1000XM6, j9, RK84, K70,
// P20i) — a real product code, NOT a bare integer ("Bluetooth 6", "Over 100",
// "Supportive Shoe 3"). A no-brand candidate needs one; a bare number is chrome.
const hasStrongCode = (s) => /[A-Za-z]\d|\d[A-Za-z]/.test(String(s)) || /\b[A-Z]{2,}-?\d/.test(String(s));
// Boilerplate / chrome / non-product fragments that the Title-Case harvester picks up
// from real pages: license footers, CTAs, timestamps, dates, bare tech-term+number,
// quantifier phrases, repeated words, nav. None of these are products.
const isBoilerplate = (name) => {
  const n = String(name || ''); const t = n.trim();
  return /\b(attribution|sharealike|noncommercial|creative commons|rights reserved)\b/i.test(n)
    || /\b(check (?:latest |the )?price|buy now|shop now|view deal|add to cart|see price|best price|guaranteed|read more|learn more)\b/i.test(n)
    || /^(?:bluetooth|displayport|hdmi|usb|wi-?fi|android|ios|version|chapter|step|figure|table|page|vol|gen|win|macos|category|section)\s+\d+$/i.test(t)
    || /\d{1,2}:\d{2}/.test(n)
    || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(n)
    || /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:19|20)\d\d$/i.test(t) // "July 2026" date fragment
    || /^(?:over|under|up to|from|about|around|approx|nearly|almost|less than|more than|at|with|for|the|a|an)\s+\$?\d/i.test(t) // "At 52g", "Over 100"
    || /^\d+(?:\.\d+)?\s*(?:k|m|g|kg|mm|cm|hz|mah|wh|w|gb|tb|ms|nits|lbs?|oz|fps|hrs?|hours?)$/i.test(t)                       // bare spec/measure "52g", "144K"
    || /\b(\w+)\s+\1\b/i.test(n)
    || ((n.match(/\b(facebook|google|microsoft|meta|twitter|youtube|reddit|instagram|tiktok|linkedin|wikipedia|netflix)\b/gi) || []).length >= 2) // company-list sentence fragment
    || /\b(wwdc|black friday|cyber monday|prime day|ces \d|computex|ifa \d|gdc|e3 \d|keynote|live blog)\b/i.test(n) // event / chrome fragment
    || /\bpty\s*\.?\s*ltd\b|\bgmbh\b|\bllc\b|\bplc\b|incorporated\b|\bholdings\b|\bs\.?a\.?r\.?l\b/i.test(n) // a CORPORATE ENTITY, not a product ("Blue Connect Technology Pty Ltd")
    || /\b(inc|ltd|corp|llp|co)\.?$/i.test(t)
    || /\b(privacy|cookies?|terms of|subscribe|newsletter|sign in|log in|skip to|table of contents|all rights)\b/i.test(n);
};
// Distinct known brands in a token list — 3+ is a company LIST ("Apple Facebook Google
// Microsoft"), not a product; a 2nd NON-ADJACENT brand is two products merged
// ("Apple AirPods | Sony XM6") and the name should be truncated at it.
function brandTruncate(toks) {
  let first = -1, cut = toks.length; const seen = new Set();
  for (let k = 0; k < toks.length; k++) {
    if (BRANDS.has(cleanTok(toks[k]).toLowerCase())) {
      seen.add(cleanTok(toks[k]).toLowerCase());
      if (first < 0) first = k;
      else if (k > first + 1) { cut = k; break; } // non-adjacent 2nd brand → cut (merge)
    }
  }
  const out = toks.slice(0, cut);
  // Drop if 3+ distinct brands (a company LIST), or the result is ENTIRELY brands/
  // stopwords with no model token ("Apple Facebook", "Anker Soundcore" alone).
  const allBrandOrStop = out.length >= 2 && out.every((t) => { const l = cleanTok(t).toLowerCase(); return BRANDS.has(l) || STOPWORDS.has(l); });
  return { toks: out, drop: seen.size >= 3 || allBrandOrStop };
}
// Strip LEADING non-product words that bleed before the brand ("Home Keyboard Reviews
// Keychron Q6" → "Keychron Q6", "Public Keychron Q5" → "Keychron Q5"). Only fires when a
// brand appears after position 0 AND nothing before it carries a model code (so a real
// model prefix is never cut).
function trimNameLead(toks) {
  let firstBrand = -1;
  for (let k = 0; k < toks.length; k++) { if (BRANDS.has(cleanTok(toks[k]).toLowerCase())) { firstBrand = k; break; } }
  if (firstBrand <= 0) return toks;
  if (toks.slice(0, firstBrand).some((t) => hasStrongCode(t))) return toks; // don't cut a model prefix
  return toks.slice(firstBrand);
}
const firstBrand = (toks) => {
  const l = toks.map((t) => t.toLowerCase());
  if (l.length >= 2 && BRANDS.has(`${l[0]} ${l[1]}`)) return `${toks[0]} ${toks[1]}`;
  if (BRANDS.has(l[0])) return toks[0];
  return null;
};

const YEAR_RE = /^(?:19|20)\d\d$/;
const anyBrand = (toks) => firstBrand(toks) || toks.some((t) => BRANDS.has(t.toLowerCase()));
const cleanTok = (t) => t.replace(/^[("'“]+|[)"'”.,;:]+$/g, '');

// Trailing tokens that are never part of a product name: sentence-continuation
// verbs + review words. Deliberately NARROW — NOT all sentiment/stopwords, which
// would truncate legit edition names ("Charge 5 Value"); the bare-rating/ordinal
// boundary below catches "4.0"/"2nd" structurally instead.
const NAME_TAIL_DENY = new Set(['appears', 'delivers', 'offers', 'features', 'comes', 'makes', 'looks', 'sounds', 'tested', 'review', 'reviews', 'rated', 'ranked', 'seems', 'remains', 'stays', 'provides', 'brings', 'adds', 'impresses', 'the', 'a', 'an', 'and', 'or', 'but', 'with', 'for',
  // chrome/listicle words that bleed off real pages ("Qrevo Curv Review Pros", "Jet Bot … Yes")
  'pros', 'cons', 'yes', 'no', 'which', 'source', 'sources', 'dimensions', 'while', 'specifications', 'specs', 'price', 'prices', 'deal', 'deals', 'guide', 'vs', 'versus', 'exposed', 'pick', 'picks', 'kit', 'assembly', 'failures', 'here', 'now', 'today', 'update', 'updated', 'list', 'ranking', 'comparison', 'best', 'top', 'buy', 'shop', 'verdict', 'rating', 'score', 'overview', 'summary',
  // descriptive bleed common in apparel/no-model-code names ("Quince Linen Clothes Worth
  // Buying", "Banana Republic Standard-Fit Texture") — NOT category nouns (shirt/pants kept).
  'clothes', 'clothing', 'worth', 'buying', 'texture', 'tested', 'reviewed', 'recommended', 'roundup', 'edition', 'item', 'items', 'options', 'choices', 'finds', 'outfit', 'outfits', 'collection', 'wardrobe', 'essentials', 'staples', 'looks', 'styles',
  // software / spec / descriptive bleed ("Keychron Q5 Max Operating Environment", "Keychron
  // Launcher" (software), "Ducky Zero 6108 Image") — these are not part of the product name.
  'launcher', 'image', 'images', 'environment', 'operating', 'software', 'app', 'apps', 'driver', 'drivers', 'firmware', 'technology', 'technologies', 'connect', 'hub', 'manual', 'setup', 'support', 'download', 'downloads', 'gallery', 'photo', 'photos', 'video', 'unboxing',
  'bottom', 'line', 'url', 'see', 'complete', 'direct', 'amazon', 'walmart', 'target', 'newegg', 'options', 'tiktok', 'web', 'twitter', 'instagram', 'youtube', 'facebook', 'reddit',
  // trailing review-adjective bleed ("Keychron Q6 Max Exceptional", "Q5 Max Swappable") —
  // evaluative words that are never part of a real product name.
  'exceptional', 'swappable', 'amazing', 'incredible', 'fantastic', 'impressive', 'excellent', 'superb', 'outstanding', 'awesome', 'stunning', 'gorgeous', 'flawless']);
// Product-type nouns that pin a DIFFERENT category — if one appears in a name and it is
// NOT one of the query's category terms, the product belongs to another category (an
// "Apple TV" / "Sony Playstation" leaking into a keyboard query).
const FOREIGN_CATEGORY = new Set(['tv', 'television', 'playstation', 'xbox', 'nintendo', 'console', 'macbook', 'laptop', 'notebook', 'chromebook', 'iphone', 'ipad', 'tablet', 'smartphone', 'sneaker', 'sneakers', 'treadmill', 'mattress', 'sofa', 'couch', 'blender', 'microwave', 'refrigerator', 'fridge', 'dishwasher', 'games', 'mobile']);
// Strip review-score/version/ordinal noise and trailing verbs that bled into a name.
// Returns a NEW token array; tail-only, order-preserving, and never trims away the
// brand+model code (which would cause a false merge in resolveCandidates).
function trimNameTail(toks) {
  // 1) hard boundary: a bare DECIMAL (rating/version "4.0","2.0") or dangling ordinal
  //    ("2nd") is never part of a name — the name ends before it. Bare INTEGERS are
  //    left alone (usually model numbers, e.g. "Motion 300").
  let cut = toks.length;
  for (let k = 1; k < toks.length; k++) {
    const t = cleanTok(toks[k]);
    // bare rating/version "4.0", ordinal "2nd", a price "$749.99", or a timestamp
    // "02:32" are never part of a name — the name ends before them.
    if (/^\d+\.\d+$/.test(t) || /^\d+(?:st|nd|rd|th)$/i.test(t) || /^\$\d/.test(t) || /^\d{1,2}:\d{2}$/.test(t)) { cut = k; break; }
  }
  let out = toks.slice(0, cut);
  // 2) drop trailing sentence-continuation/review words, but never below 2 tokens
  //    (avoids shrinking to a bare brand → false merges).
  while (out.length > 2 && NAME_TAIL_DENY.has(cleanTok(out[out.length - 1]).toLowerCase())) out.pop();
  // hard guard: if trimming removed the only structural token (brand/model code), keep
  // the original — do not over-shorten.
  const struct = (arr) => arr.some((t) => BRANDS.has(cleanTok(t).toLowerCase()) || hasModelCode(t));
  if (!out.length || (struct(toks) && !struct(out))) return toks;
  return out;
}

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

function harvestCandidates(sources, notes, opts = {}) {
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
        const bt = brandTruncate(toks); // split a 2-product merge; flag a 3+ brand list
        if (bt.drop) continue;
        toks = trimNameTail(trimNameLead(bt.toks)); // strip leading non-product words + trailing bleed
        if (!toks.length) continue;
        const name = toks.join(' ');
        const low = name.toLowerCase();
        if (low.length < 3 || PUBLISHERS.has(low) || toks.every((t) => STOPWORDS.has(t.toLowerCase()))) continue;
        const brand = anyBrand(toks);
        const code = hasModelCode(name);
        // KEEP RULE: a real product has a known brand OR a STRONG model code (letter
        // adjacent to a digit). A no-brand name whose only "code" is a bare integer
        // ("Bluetooth 6", "Over 100", "Supportive Shoe 3") is chrome/spec noise, not a
        // product — drop it. (Brand present → keep regardless, "Motion 300" is fine.)
        if (!brand && !hasStrongCode(name)) continue;
        if (opts.physical && toks.length === 1 && !hasStrongCode(name)) continue; // bare brand for a physical product = noise ("flair")
        if (isBoilerplate(name)) continue; // license footers, CTAs, timestamps, nav
        // Real-markdown noise rejects (clean fixtures never had these):
        if (toks.length > 5) continue;                          // concatenated headings/lists
        if (toks.length >= 4 && !brand) continue;               // long non-brand string = a heading
        if (/[[\]()]|\.(?:jpg|jpeg|png|webp|gif|avif|svg)\b|https?:/i.test(name)) continue; // md/url/img debris
        if (!brand && /\b(?:more|from|vetted|customer|photo|image|zoom|click|shop|deal|review|guide|under|dollars?|cheapest|budget|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(low)) continue; // nav/date/category
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

// High-precision criticism cues — feature-absence + complaint phrasing that signals a
// drawback even when the VADER polarity is mild (real reviews bury cons in "lacks
// LDAC", "the only downside", "wish it had", "battery life is short"). Used by the
// proximity body-miner; deliberately specific to avoid false positives ("no issues").
const CON_CUE = /\b(lacks?|lacking|missing|doesn'?t have|does not have|don'?t have|no (?:ldac|aptx|anc|usb-?c|wireless charging|warranty|app control|water resistance)|wish (?:it|they|i) (?:had|could|would)|only (?:downside|complaint|issue|gripe|drawback)|main (?:downside|drawback|complaint|gripe)|the catch|the downside|biggest (?:downside|drawback)|drawback|gripe|caveat|could be better|falls? short|struggles? (?:with|to|in)|fails? to|too (?:small|big|bulky|heavy|loud|quiet|short|expensive|pricey|dim|tight|stiff|thin|flimsy)|(?:bit|fairly|quite|rather|somewhat|a little|on the) (?:heavy|bulky|loud|noisy|expensive|pricey|dim|slow|stiff|thin|short)(?:\s+side)?|not (?:as good|the best|great|comfortable|worth)|battery (?:life )?(?:is |was )?(?:short|weak|poor|mediocre|disappointing|only|just)|short battery|runs? hot|overheats?|disappoint(?:ing|ed)?|flimsy|cheaply made|poorly (?:made|built))\b/i;
// A neutral META/category statement (not a product-specific con) — guards the
// strong-negative branch against "...whose models range from inexpensive to pricey".
const META_STMT = /\b(brands?|models?|range from|evaluates?|generally|category|options|overall|most of|many of|whose models|the lineup|across the board)\b/i;
// Feature-presence / praise cues — let the proximity miner accept a positive clause
// even when the VADER score is only mildly positive ("hot-swappable PCB", "great
// battery life", "comfortable for long sessions"). High-precision to avoid generic fluff.
const PRO_CUE = /\b(excellent|outstanding|impressive|standout|superb|fantastic|comfortable|durable|reliable|sturdy|responsive|crisp|punchy|premium|well.?built|top.?notch|class.?leading|best.?in.?class|hot.?swap\w*|gasket|wireless|long battery|great battery|excellent battery|easy to|love (?:the|how|that)|highly recommend|worth (?:it|the)|great value|best value|customizable|versatile|seamless|powerful|lightweight|portable|rugged|gorgeous|sleek)\b/i;
// A source TITLE / product-listing line ("Review NuPhy Air75 V3 … 84 Keys 75% Custom"),
// not a sentence of criticism — title-case heavy with spec/listing tokens and no verb.
function looksLikeListing(clean) {
  if (/^(?:review|the best|top \d|best \d|\d+ best)\b/i.test(clean)) return true;
  const toks = clean.split(/\s+/);
  const capRatio = toks.filter((w) => /^[A-Z0-9]/.test(w)).length / Math.max(1, toks.length);
  return toks.length >= 5 && capRatio > 0.6 && /\b(keys?|wireless|mechanical|bluetooth|custom|rgb|hot.?swap|\d{2,}%|gen|edition)\b/i.test(clean);
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
  const negHit = (txt) => (txt.toLowerCase().match(/[a-z0-9'’#-]+/g) || []).some((w) => (VALENCE[w] ?? 0) <= -0.8);
  const pros = [], cons = [];
  for (const ps of proConSents) {
    const sentHasRival = otherIn(ps.sentence);
    for (const cl of clausesWithContrast(ps.sentence)) {
      const clean = tidyClause(cl.text);
      if (clean.length < 12 || clean.length > 220) continue;
      if (looksLikeHeadline(clean) || looksLikeListing(clean)) continue; // drop listicle/heading/title lines
      // multi-product sentence: keep only clauses that name THIS product and no rival.
      // single-product sentence: all its clauses attribute here (carries the "but …" con).
      if (sentHasRival && (!selfIn(clean) || otherIn(clean))) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue; // never reuse the same clause across products
      const { score, hits } = sentencePolarity(clean);
      if (!hits) continue;
      if (score >= 0.8) { pros.push({ text: clean, score, cred: ps.cred }); seen.add(key); }
      // con: a clearly-negative clause, OR a post-contrast ("but …") clause with a real
      // negative term whose net is only mild because a category word cancelled it.
      else if (score <= -0.6 || (cl.afterContrast && score < 0.2 && negHit(clean))) {
        cons.push({ text: clean, score, cred: ps.cred }); seen.add(key);
      }
    }
  }

  // PROXIMITY con-mining over credible review BODIES: real reviews state criticism a
  // sentence or two AFTER the product name (or as feature-absence — "lacks LDAC"),
  // which the same-sentence loop above misses. Scan a 3-sentence window around each
  // mention in a credible body, STOP at a rival mention (attribution boundary), and
  // accept grounded negative / feature-absence clauses. Capped + body-only so
  // grounding + precision hold (every con is still a verbatim source span).
  if (cons.length < 3) {
    const bodies = support.filter((s) => s.score >= MIN_CREDIBLE_SCORE
      && !(s.tags || []).every((t) => NONCREDIBLE_GENRES.has(t))
      && String(s.source.content || '').length >= 400);
    outer:
    for (const s of bodies) {
      const sents = sentences(s.source.content);
      for (let i = 0; i < sents.length; i++) {
        if (!selfIn(sents[i])) continue;
        for (let j = i; j <= i + 2 && j < sents.length; j++) {
          if (j > i && otherIn(sents[j]) && !selfIn(sents[j])) break; // rival → stop window
          for (const cl of clausesWithContrast(sents[j])) {
            const clean = tidyClause(cl.text);
            if (clean.length < 14 || clean.length > 220 || looksLikeHeadline(clean)) continue;
            if (otherIn(clean) && !selfIn(clean)) continue; // names only a rival
            const key = clean.toLowerCase();
            if (seen.has(key)) continue;
            const { score } = sentencePolarity(clean);
            if (score >= 0.6) continue;                    // leans positive → not a con
            if (looksLikeListing(clean)) continue;         // source title / product-listing line, not a con
            // PRECISION: a con needs an explicit complaint CUE, or a strongly-negative,
            // SHORT, focused clause (not a rambling meta/category statement — that was the
            // "out of tight spots" / "...to pricey" false-positive source).
            const isCon = CON_CUE.test(clean)
              || (score <= -0.7 && negHit(clean) && clean.length <= 110 && !META_STMT.test(clean));
            if (!isCon) continue;
            cons.push({ text: clean, score: Math.min(score, -0.3), cred: s.score });
            seen.add(key);
            if (cons.length >= 3) break outer;
          }
        }
      }
    }
  }
  // Recall fallback: a legit, credibly-sourced product mentioned ONLY in comparisons
  // (e.g. "A and B are the best picks") would otherwise lose every clause and be
  // dropped — and dropping a real product is itself a lie. Allow ONE comparative
  // clause that positively names it (deduped), so it still appears honestly.
  if (pros.length === 0) {
    for (const ps of proConSents) {
      let done = false;
      for (const cl of clausesWithContrast(ps.sentence)) {
        const clean = tidyClause(cl.text);
        if (clean.length < 12 || clean.length > 220 || looksLikeHeadline(clean) || !selfIn(clean) || seen.has(clean.toLowerCase())) continue;
        const { score, hits } = sentencePolarity(clean);
        if (hits && score >= 0.8) { pros.push({ text: clean, score, cred: ps.cred }); seen.add(clean.toLowerCase()); done = true; break; }
      }
      if (done) break;
    }
  }

  // PROXIMITY pro-mining over credible BODIES (mirror of the con miner): the same-
  // sentence pass misses praise stated a sentence after the product name, so most
  // thinly-mentioned-but-real products end up with ≤1 pro and get dropped. Scan a
  // 3-sentence window around each mention and accept grounded POSITIVE clauses. This
  // both RESCUES real products (so they survive the ≥1-evidence inclusion gate) and
  // gives the comprehensive tail substance. Every pro stays a verbatim source span.
  if (pros.length < 3) {
    const bodies = support.filter((s) => s.score >= MIN_CREDIBLE_SCORE
      && !(s.tags || []).every((t) => NONCREDIBLE_GENRES.has(t))
      && String(s.source.content || '').length >= 400);
    outerPro:
    for (const s of bodies) {
      const sents = sentences(s.source.content);
      for (let i = 0; i < sents.length; i++) {
        if (!selfIn(sents[i])) continue;
        for (let j = i; j <= i + 2 && j < sents.length; j++) {
          if (j > i && otherIn(sents[j]) && !selfIn(sents[j])) break; // rival → stop window
          for (const cl of clausesWithContrast(sents[j])) {
            const clean = tidyClause(cl.text);
            if (clean.length < 14 || clean.length > 220 || looksLikeHeadline(clean) || looksLikeListing(clean)) continue;
            if (otherIn(clean) && !selfIn(clean)) continue;
            const key = clean.toLowerCase();
            if (seen.has(key)) continue;
            const { score } = sentencePolarity(clean);
            // a clearly-positive clause, or a pre-contrast clause with a feature/praise cue.
            const isPro = score >= 0.8 || (!cl.afterContrast && score >= 0.2 && PRO_CUE.test(clean));
            if (!isPro) continue;
            pros.push({ text: clean, score: Math.max(score, 0.8), cred: s.score });
            seen.add(key);
            if (pros.length >= 3) break outerPro;
          }
        }
      }
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

export function analyze(query, notes, sources, facets = {}, topicalCategory = '') {
  // Strip jina markdown FIRST so link/image/url/heading syntax can't leak anywhere.
  const cleanSources = (sources || []).map((s) => ({ ...s, title: stripMarkdown(s.title), content: stripMarkdown(s.content) }));
  const cleanNotes = (notes || []).map((n) => ({ ...n, content: stripMarkdown(n.content) }));
  const catTerms = categoryTerms(topicalCategory, query);
  // Physical products are always "Brand Model" — a single bare brand token ("flair",
  // "rigid", "Armani") is collision/sentence-fragment noise. Services/software (email
  // tools, apps) ARE legitimately one word (Brevo, Notion), so only require ≥2 tokens
  // when the query is for a buyable physical product.
  const physical = facets?.sold_on_amazon !== false && facets?.is_service !== true && facets?.is_content !== true;
  const harvested = resolveCandidates(harvestCandidates(cleanSources, cleanNotes, { physical }));
  const allMatch = harvested.map((c) => ({ c, m: aliasMatchers(c) }));
  const seen = new Set(); // a given clause is used as a pro/con for at most ONE product
  const products = [];
  let _zeroPC = 0, _corrob = 0;
  for (const c of harvested) {
    const others = allMatch.filter((x) => x.c !== c).flatMap((x) => x.m).filter((m) => m.length > 2);
    const a = analyzeProduct(c, cleanSources, others, seen);
    // INCLUSION RULE: keep only products with credible (non-listicle/affiliate/
    // manufacturer) support — suppresses fabricated traps — AND require CORROBORATION
    // (≥2 credible sources, OR a strong hands-on/expert source plus ≥2 real pros/cons).
    // Real pages flood the harvester with one-off brand mentions; corroboration prunes them.
    const credible = a.support.filter((s) => s.score >= MIN_CREDIBLE_SCORE && !s.tags.every((t) => NONCREDIBLE_GENRES.has(t)));
    if (a.pros.length === 0 && a.cons.length === 0) { _zeroPC++; continue; }
    // CATEGORY GATE: the product must be discussed in the query's category. A laptop /
    // running shoe / vacuum that leaked from a mixed listicle into a keyboard query never
    // mentions a keyboard term → dropped. (No-op when no category terms were derivable.)
    if (!inCategory(c, a.support, catTerms)) { _corrob++; continue; }
    // foreign-category noun in the name (not a query term) → it's another category's product
    if (c.name.toLowerCase().split(/\s+/).some((w) => FOREIGN_CATEGORY.has(w) && !catTerms.has(w))) { _corrob++; continue; }
    // INCLUSION: require ≥1 CREDIBLE source (non-listicle/affiliate/manufacturer) — this
    // is the fabricated-trap suppressor (a trap has only promotional support → 0 credible
    // → dropped). We deliberately DO NOT require extra corroboration anymore: the goal is
    // COMPREHENSIVE honest coverage (show every real, credibly-mentioned product), not a
    // curated top-few. Thin products are surfaced with their evidence + honest caveats.
    if (credible.length < 1) { _corrob++; continue; }
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
  // rank by RATING first (quality — the cap already requires real evidence for a high
  // score), then credible-evidence mass as the tiebreaker. Ranking by mention-count
  // alone wrongly floats the "cheap alternative" above the actual top pick.
  products.sort((a, b) => b.rating - a.rating || b._weight - a._weight);
  if (typeof process !== 'undefined' && process.env && process.env.DEBUG_FUNNEL) {
    console.error(`[funnel] harvested=${harvested.length} dropZeroProCon=${_zeroPC} dropCredible=${_corrob} passed=${products.length} → shown=${Math.min(products.length, 40)}`);
  }
  // Comprehensive but pipeline-safe: each shown product costs downstream ASIN + image +
  // con-selector work, so an unbounded list times out the queue consumer. 24 is ~2.5x the
  // old 10 (the "see them all" win) while staying within the per-run subrequest/time budget.
  const capped = products.slice(0, 24);
  capped.forEach((p, i) => { p.rank = i + 1; });
  return capped;
}

// Candidate con SPANS for the hybrid LLM con-selector: every credible-BODY sentence
// (+ its 1-2 sentence proximity window, stopping at a rival) that mentions a product.
// Returns clean verbatim spans — positive, neutral, AND negative — so the LLM selector
// can identify criticism the lexicon missed; the selector's output is then gated to be
// a substring of THESE spans, so nothing can be invented.
export function conCandidateSpans(productName, aliases, sources, rivalNames = [], cap = 14) {
  const matchers = [String(productName || '').toLowerCase(), ...(aliases || []).map((a) => String(a).toLowerCase())].filter((m) => m && m.length > 2);
  const code = modelToken(String(productName || '').split(/\s+/));
  if (code && code.length >= 3) matchers.push(code);
  const rivals = (rivalNames || []).map((n) => String(n).toLowerCase()).filter((r) => r && !matchers.includes(r) && r.length > 3);
  const selfIn = (t) => matchers.some((m) => t.toLowerCase().includes(m));
  const otherIn = (t) => rivals.some((m) => t.toLowerCase().includes(m));
  const spans = []; const seen = new Set();
  for (const s of sources || []) {
    if ((s.credibility?.score ?? 0) < MIN_CREDIBLE_SCORE) continue;
    if ((s.credibility?.tags || []).length && (s.credibility.tags).every((t) => NONCREDIBLE_GENRES.has(t))) continue;
    const body = stripMarkdown(s.content || '');
    if (body.length < 400) continue;
    const sents = sentences(body);
    for (let i = 0; i < sents.length; i++) {
      if (!selfIn(sents[i])) continue;
      for (let j = i; j <= i + 2 && j < sents.length; j++) {
        if (j > i && otherIn(sents[j]) && !selfIn(sents[j])) break;
        const clean = tidyClause(sents[j]).slice(0, 220);
        if (clean.length < 24 || looksLikeListing(clean) || looksLikeHeadline(clean)) continue;
        if (otherIn(clean) && !selfIn(clean)) continue;
        const key = clean.toLowerCase();
        if (!seen.has(key)) { seen.add(key); spans.push(clean); }
      }
      if (spans.length >= cap) break;
    }
    if (spans.length >= cap) break;
  }
  return spans.slice(0, cap);
}

export { sentences, sentencePolarity, MARKETING };
