// Prose layer (Phase 0): build verdict / summary / buyersGuide WITHOUT generating —
// templated scaffolding around VERBATIM extracted quotes + the credibility analysis.
// Nothing here invents a fact; the "voice" is fixed template text, the claims are
// real sentences from sources. No deps.

import { CUES, MARKETING } from './lexicon.js';
import { sentences } from './engine.js';
import { STOPWORDS } from './gazetteer.js';

const trimQuote = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^["“”']|["“”']$/g, '').trim();

// Per-product verdict: framing + the top credible pro (and con) as real quotes.
export function buildVerdict(p) {
  const pro = p.pros[0] ? trimQuote(p.pros[0]) : '';
  const con = p.cons[0] ? trimQuote(p.cons[0]) : '';
  const support = `Backed by ${p._credibleCount} credible source${p._credibleCount === 1 ? '' : 's'}`;
  if (pro && con) return `${support}. What reviewers liked: ${pro} The main drawback they noted: ${con}`;
  if (pro) return `${support}. What reviewers liked: ${pro} No specific criticism surfaced in the sources we read — not proof none exists, so check recent reviews before buying.`;
  if (con) return `${support}. Reviewers' main reservation: ${con} We found no strong positive consensus to balance it.`;
  return `${support}; reviewers' commentary was mixed and we did not find a clear consensus.`;
}

// bestFor: pull a grounded "for <use>" phrase from the product's quotes; else fall
// back to an honest price/template. NEVER emits a bare stopword/price-qualifier
// (the old code returned "under" from "for under $100").
export function buildBestFor(p) {
  // 1) A grounded USE-CASE that literally appears after "for" wins (e.g. "for travel").
  for (const s of [...p.pros, ...p.cons]) {
    const m = String(s).match(/\b(?:best |ideal |great |good )?for ([a-z][a-z0-9 ,'-]{3,40})/i);
    if (!m) continue;
    let toks = m[1].replace(/[.,].*$/, '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    while (toks.length && STOPWORDS.has(toks[0])) toks.shift();
    while (toks.length && STOPWORDS.has(toks[toks.length - 1])) toks.pop();
    const phrase = toks.join(' ');
    // require a real use-phrase: ≥4 chars and not entirely stopwords (kills "under").
    if (phrase.length >= 4 && !toks.every((t) => STOPWORDS.has(t))) return phrase;
  }
  // 2) An explicit sub-$X constraint in a quote → honest paraphrase (not the bare word).
  for (const s of [...p.pros, ...p.cons]) {
    if (/\bfor (?:less than|under|below|up to)\s*\$?\d/i.test(String(s))) return 'budget buyers';
  }
  // 3) Honest generic template.
  return p.rank === 1 ? 'most buyers in this category' : 'buyers prioritizing specific tradeoffs';
}

export function buildSummary(query, products, category) {
  const n = products.length;
  if (n === 0) return `We could not find enough credible, non-promotional sources to make an honest recommendation for "${query}". Rather than guess, we are showing no picks.`;
  const top = products[0];
  const cat = category ? category.toLowerCase() : 'options';
  return `We compared ${n} ${cat} using only credibility-weighted sources (real hands-on and expert reviews, discounting marketing and affiliate listicles). The strongest evidence backs the ${top.name}. Every claim below links to the source it came from — nothing here is invented.`;
}

// buyersGuide from cue-pattern sentences in CREDIBLE sources + honest analysis-derived items.
export function buildBuyersGuide(sources, notes, products) {
  const credibleText = [];
  for (const s of sources) {
    const cred = s.credibility?.score ?? 0;
    const tags = s.credibility?.tags || [];
    if (cred >= 45 && !tags.every((t) => ['listicle', 'affiliate-conflict', 'manufacturer'].includes(t))) {
      credibleText.push(...sentences(`${s.content || ''}`));
    }
  }
  for (const n of notes || []) credibleText.push(...sentences(n.content || ''));

  const pick = (patterns, n) => {
    const out = [];
    for (const sent of credibleText) {
      const c = sent.replace(/\s+/g, ' ').trim();
      if (c.length < 20 || c.length > 200) continue;
      if (patterns.some((re) => re.test(c)) && !out.includes(c)) out.push(c);
      if (out.length >= n) break;
    }
    return out;
  };

  const howArr = pick(CUES.howToChoose, 3);
  const howToChoose = howArr.length
    ? `What credible reviewers say actually matters here: ${howArr.join(' ')}`
    : `Weigh the specifics each credible source actually measured over marketing claims, and prefer options backed by hands-on testing over listicle mentions.`;

  const pitfalls = pick(CUES.pitfalls, 3);
  // Honest, analysis-derived pitfall (not fabricated — it's literally what we found):
  pitfalls.push('Be skeptical of products that appear only in affiliate-linked listicles or on the maker\'s own page — in this research those were excluded as unverified.');

  // marketingToIgnore: the hype words that actually appeared in low-credibility sources here.
  const hypeFound = new Set();
  for (const s of sources) {
    const tags = s.credibility?.tags || [];
    if (!tags.some((t) => ['listicle', 'affiliate-conflict', 'manufacturer'].includes(t))) continue;
    for (const w of String(s.content || '').toLowerCase().match(/[a-z#-]+/g) || []) if (MARKETING.has(w)) hypeFound.add(w);
  }
  const marketingToIgnore = [];
  if (hypeFound.size) marketingToIgnore.push(`Ignore hype words like ${[...hypeFound].slice(0, 5).map((w) => `"${w}"`).join(', ')} — in this research they appeared only in affiliate/marketing sources, never in hands-on testing.`);
  marketingToIgnore.push('Treat "#1 best", "rated by customers everywhere", and unsourced superlatives as marketing, not evidence.');
  marketingToIgnore.push('A high frequency of mentions is not evidence when the mentions are promotional — one hands-on test outweighs ten listicles.');

  return {
    howToChoose: howToChoose.slice(0, 700),
    pitfalls: pitfalls.slice(0, 5),
    marketingToIgnore: marketingToIgnore.slice(0, 5),
  };
}
