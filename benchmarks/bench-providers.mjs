#!/usr/bin/env node
// Provider corpus-quality benchmark: Serper vs Brave vs Tavily vs SearXNG
// (+ the UNION of all four = "use them all"). For each query we fire one search
// per provider, normalize results, and score them with the REAL engine
// credibility scorer — so we measure the quality of the corpus each provider
// feeds the synth, not just raw counts.
//
// Metrics per provider:
//   results/q   — coverage (avg results returned per query)
//   cred        — avg source credibility (scoreSource: hands-on/expert vs listicle/affiliate)
//   %hi         — share of results scoring >=65 (genuinely good sources)
//   %aff        — share flagged affiliate-conflict (junk we down-rank)
//   %price      — share whose snippet carries a $price (grounding fuel)
//   asin        — total Amazon /dp/ + retailer product links (affiliate fuel)
//   ms          — avg provider latency
//
// Usage:
//   node benchmarks/bench-providers.mjs            # 20 queries
//   MAX_Q=50 node benchmarks/bench-providers.mjs   # all harvested queries
//
import { readFileSync } from 'node:fs';
import { scoreSource, extractAmazonProductUrls, isAffiliateUrl } from '../worker/lib/credibility.js';

// ── keys ───────────────────────────────────────────────────────────────────────
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SERPER = env.SERPER_API_KEY, BRAVE = env.BRAVE_API_KEY, TAVILY = env.TAVILY_API_KEY;
const SEARXNG = process.env.SEARXNG_URL || 'http://192.168.5.10:8095';

// ── queries ──────────────────────────────────────────────────────────────────
const ALL = JSON.parse(readFileSync(new URL('./results/google-top50-queries.json', import.meta.url), 'utf8'));
const MAX_Q = Number(process.env.MAX_Q) || 20;
const QUERIES = ALL.slice(0, MAX_Q).map((q) => q.q);

// ── normalized providers (one call each; null on failure) ──────────────────────
const norm = (title, url, content) => ({ title: title || '', url: url || '', content: content || '' });

async function pSerper(q) {
  if (!SERPER) return null;
  const r = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': SERPER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: 10 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.organic || []).map((o) => norm(o.title, o.link, o.snippet));
}
async function pBrave(q) {
  if (!BRAVE) return null;
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, {
    headers: { 'X-Subscription-Token': BRAVE, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.web?.results || []).map((o) => norm(o.title, o.url, o.description));
}
async function pTavily(q) {
  if (!TAVILY) return null;
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: TAVILY, query: q, max_results: 10 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.results || []).map((o) => norm(o.title, o.url, o.content));
}
async function pSearxng(q) {
  const r = await fetch(`${SEARXNG}/search?q=${encodeURIComponent(q)}&format=json`);
  if (!r.ok) return null;
  const d = await r.json();
  return (d.results || []).slice(0, 10).map((o) => norm(o.title, o.url, o.content));
}

const PROVIDERS = [
  { name: 'serper', fn: pSerper },
  { name: 'brave', fn: pBrave },
  { name: 'tavily', fn: pTavily },
  { name: 'searxng', fn: pSearxng },
];

// ── scoring ────────────────────────────────────────────────────────────────────
const PRICE = /(?:US)?\$\s?\d[\d,]*(?:\.\d{2})?/;
function scoreResults(results) {
  const acc = { n: 0, credSum: 0, hi: 0, aff: 0, price: 0, asin: 0, creds: [] };
  for (const res of results) {
    const { score, tags } = scoreSource({ title: res.title, url: res.url, content: res.content });
    acc.n++;
    acc.credSum += score;
    acc.creds.push(score);
    if (score >= 65) acc.hi++;
    if (tags.includes('affiliate-conflict') || isAffiliateUrl(res.url)) acc.aff++;
    if (PRICE.test(res.content)) acc.price++;
    acc.asin += extractAmazonProductUrls(`${res.url} ${res.content}`).length;
  }
  return acc;
}
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── run ────────────────────────────────────────────────────────────────────────
const agg = {}; // provider -> totals
for (const p of [...PROVIDERS.map((p) => p.name), 'UNION']) {
  agg[p] = { n: 0, credSum: 0, hi: 0, aff: 0, price: 0, asin: 0, creds: [], ms: 0, calls: 0, fails: 0, queries: 0 };
}

for (const q of QUERIES) {
  process.stderr.write(`▸ ${q}\n`);
  const perProvResults = {};
  await Promise.all(PROVIDERS.map(async (p) => {
    const t0 = Date.now();
    let results = null;
    try { results = await p.fn(q); } catch { results = null; }
    const ms = Date.now() - t0;
    const a = agg[p.name];
    a.calls++; a.ms += ms;
    if (!results) { a.fails++; perProvResults[p.name] = []; process.stderr.write(`    ${p.name}: FAIL (${ms}ms)\n`); return; }
    perProvResults[p.name] = results;
    const s = scoreResults(results);
    a.n += s.n; a.credSum += s.credSum; a.hi += s.hi; a.aff += s.aff; a.price += s.price; a.asin += s.asin;
    a.creds.push(...s.creds); a.queries++;
    process.stderr.write(`    ${p.name}: ${s.n} results, cred ${(s.credSum / (s.n || 1)).toFixed(0)} (${ms}ms)\n`);
  }));
  // UNION: dedupe across providers by normalized URL
  const seen = new Map();
  for (const name of Object.keys(perProvResults)) {
    for (const res of perProvResults[name]) {
      const key = (res.url || '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
      if (key && !seen.has(key)) seen.set(key, res);
    }
  }
  const u = agg.UNION;
  const us = scoreResults([...seen.values()]);
  u.n += us.n; u.credSum += us.credSum; u.hi += us.hi; u.aff += us.aff; u.price += us.price; u.asin += us.asin;
  u.creds.push(...us.creds); u.queries++; u.calls++;
}

// ── report ───────────────────────────────────────────────────────────────────
const rows = Object.entries(agg).map(([provider, a]) => ({
  provider,
  'results/q':  a.queries ? +(a.n / a.queries).toFixed(1) : 0,
  cred:         a.n ? +(a.credSum / a.n).toFixed(1) : 0,
  cred_median:  median(a.creds),
  '%hi':        a.n ? `${Math.round(100 * a.hi / a.n)}%` : '—',
  '%aff':       a.n ? `${Math.round(100 * a.aff / a.n)}%` : '—',
  '%price':     a.n ? `${Math.round(100 * a.price / a.n)}%` : '—',
  asin:         a.asin,
  avg_ms:       a.calls && provider !== 'UNION' ? Math.round(a.ms / a.calls) : '—',
  fails:        provider === 'UNION' ? '—' : a.fails,
}));

console.log(`\n══ PROVIDER CORPUS-QUALITY BENCHMARK (${QUERIES.length} real Google queries) ══`);
console.log('cred 0-100 (hands-on/expert vs listicle/affiliate) · %hi = cred>=65 · asin = product links\n');
console.table(rows);
console.log('\nUNION = dedup of all four per query → what "use them all" yields.');
