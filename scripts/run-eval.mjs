#!/usr/bin/env node
// Golden-query eval: scores the LIVE site's research output against
// eval/golden-queries.json. This measures honesty at the OUTPUT layer —
// pick correctness, disclosure presence, depth thresholds, freshness —
// complementing the model-selection benchmarks that picked the synth tiers.
//
//   node scripts/run-eval.mjs                # audit existing pages (free)
//   node scripts/run-eval.mjs --spend        # also enqueue runs for missing
//                                            # queries (~$0.10 each, budget-
//                                            # governed server-side)
//   BASE_URL=http://localhost:8787 node scripts/run-eval.mjs   # against dev
//
// Default mode NEVER triggers paid research: missing queries are reported as
// "missing" and only run when --spend is passed. Zero dependencies.

import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'https://chrisputer.tech';
const SPEND = process.argv.includes('--spend');
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const config = JSON.parse(readFileSync(new URL('../eval/golden-queries.json', import.meta.url), 'utf8'));
const { min_products, min_sources, max_age_days } = config.checks;

async function getJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Find an existing research page for a query without spending: suggest
// endpoint does LIKE matching over public (non-thin) pages.
async function findExisting(query) {
  const { body } = await getJson(`/api/search/suggest?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(body)) return null;
  const qTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  for (const cand of body) {
    const c = (cand.query || '').toLowerCase();
    if (qTokens.every((t) => c.includes(t))) return cand.slug;
  }
  return null;
}

async function runAndWait(query) {
  const { body: started } = await getJson('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!started?.id) return { error: started?.error || 'submit failed' };
  if (started.cached) return { slug: started.slug };
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { body } = await getJson(`/api/research/${started.id}`);
    if (body?.status === 'completed') return { slug: body.slug };
    if (body?.status === 'error') return { error: body.error || 'research failed' };
  }
  return { error: 'timeout' };
}

async function scoreSlug(slug, accepted) {
  // Everything needed is in the SSR page itself — the Our-Pick box names the
  // rank-1 product, product cards and source counts are countable, and the
  // disclosure is literal text. No structured API needed, no auth, no spend.
  const pageRes = await fetch(`${BASE}/research/${slug}`);
  const html = await pageRes.text();

  const m = html.match(/class="ourpick-name">([^<]+)</);
  const topPick = m ? m[1] : '';
  const productCount = (html.match(/class="product" id="product-/g) || []).length;
  const sourceCount = (() => {
    const m = html.match(/Sources \((\d+)\)/);
    return m ? parseInt(m[1], 10) : null;
  })();
  const ageDays = (() => {
    const m = html.match(/datetime="(\d{4}-\d{2}-\d{2})"/g);
    if (!m || m.length === 0) return null;
    const newest = m.map((s) => Date.parse(s.slice(10, 20))).sort((a, b) => b - a)[0];
    return Math.floor((Date.now() - newest) / 86400000);
  })();

  const topLower = topPick.toLowerCase();
  return {
    slug,
    top_pick: topPick,
    pick_correct: accepted.some((w) => topLower.includes(w.toLowerCase())),
    disclosure_present: /may earn a commission/i.test(html),
    product_count: productCount,
    products_ok: productCount >= min_products,
    source_count: sourceCount,
    sources_ok: sourceCount == null ? null : sourceCount >= min_sources,
    age_days: ageDays,
    fresh_ok: ageDays == null ? null : ageDays <= max_age_days,
  };
}

const results = [];
for (const g of config.queries) {
  let slug = await findExisting(g.query);
  if (!slug && SPEND) {
    process.stderr.write(`running: ${g.query}\n`);
    const run = await runAndWait(g.query);
    if (run.slug) slug = run.slug;
    else { results.push({ query: g.query, status: 'failed', error: run.error }); continue; }
  }
  if (!slug) {
    results.push({ query: g.query, status: 'missing', note: 'no live page; re-run with --spend' });
    continue;
  }
  const score = await scoreSlug(slug, g.accepted_winners);
  results.push({ query: g.query, status: 'scored', ...score });
}

const scored = results.filter((r) => r.status === 'scored');
const summary = {
  base: BASE,
  scored: scored.length,
  missing: results.filter((r) => r.status === 'missing').length,
  failed: results.filter((r) => r.status === 'failed').length,
  pick_accuracy: scored.length ? `${scored.filter((r) => r.pick_correct).length}/${scored.length}` : 'n/a',
  disclosure: scored.length ? `${scored.filter((r) => r.disclosure_present).length}/${scored.length}` : 'n/a',
  depth_ok: scored.length ? `${scored.filter((r) => r.products_ok).length}/${scored.length}` : 'n/a',
  fresh_ok: scored.length ? `${scored.filter((r) => r.fresh_ok !== false).length}/${scored.length}` : 'n/a',
};

console.log(JSON.stringify({ summary, results }, null, 2));
const hardFails = scored.filter((r) => !r.pick_correct || !r.disclosure_present).length;
process.exit(hardFails > 0 ? 1 : 0);
