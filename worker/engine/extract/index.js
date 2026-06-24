// Pure-ML extraction synthesizer (Phase 0) — DROP-IN for the LLM synthesis step.
// Same inputs (query, notes, sources, facets, topicalCategory) and same output JSON
// shape as buildSynthesisPrompt's report, so validate.js + the frontend are unchanged.
// It cannot fabricate: every field is extracted from, or templated around, real
// source spans. No deps; runs in the Worker in ~tens of ms.

import { analyze, conCandidateSpans } from './engine.js';
import { buildVerdict, buildBestFor, buildSummary, buildBuyersGuide } from './prose.js';
import { selectCons } from './con-selector.js';
import { cleanProducts } from './name-cleaner.js';

const _k = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// HYBRID con enrichment (opt-in): for products the deterministic pass left thin on
// cons, ask the GATED LLM con-selector to pick criticism from real source spans. The
// selector can only return verbatim source substrings (its own groundedness gate), so
// this adds recall WITHOUT adding a fabrication surface. Mutates report in place; safe
// no-op without a model/key. Runs only on thin products, concurrency-capped, cheap.
export async function enrichConsLLM(report, sources, apiKey, model, { minCons = 2, maxCons = 3, concurrency = 6, topN = 15 } = {}) {
  if (!apiKey || !model || !report?.products?.length) return report;
  const allNames = report.products.map((p) => p.name);
  // Only enrich the TOP-ranked thin products — enriching a 24-item list would fire too
  // many LLM calls and time out the queue consumer. The tail keeps its deterministic cons.
  const thin = report.products.filter((p) => (p.cons || []).length < minCons && (typeof p.rank !== 'number' || p.rank <= topN));
  let idx = 0;
  const worker = async () => {
    while (idx < thin.length) {
      const p = thin[idx++];
      const spans = conCandidateSpans(p.name, [], sources, allNames.filter((n) => n !== p.name));
      if (spans.length < 2) continue;
      let picked = [];
      try { picked = await selectCons(p.name, spans, apiKey, model, maxCons); } catch { picked = []; }
      const have = new Set((p.cons || []).map(_k));
      let gained = false;
      for (const c of picked) {
        if ((p.cons || []).length >= maxCons) break;
        const k = _k(c);
        if (k && !have.has(k)) { (p.cons ||= []).push(c); have.add(k); gained = true; }
      }
      // Rebuild the verdict so it no longer claims "no specific criticism" once cons exist.
      if (gained) p.verdict = buildVerdict({ pros: p.pros || [], cons: p.cons || [], _credibleCount: Number(p.metadata?.sources) || 1 });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, thin.length || 1) }, worker));
  return report;
}

export function synthesizeExtractive(query, notes, sources, facets = {}, topicalCategory = '') {
  const ranked = analyze(query, notes || [], sources || [], facets || {}, topicalCategory || '');

  const products = ranked.map((p) => ({
    name: p.name,
    brand: p.brand || '',
    price: p.price,            // null when no source states one (honest blank)
    rating: p.rating,          // editorial, evidence-derived; never invented precision
    productUrl: '',
    manufacturerUrl: '',
    imageUrl: '',
    pros: p.pros,              // verbatim source sentences (the receipts)
    cons: p.cons,
    specs: p.specs || {},      // number+unit pairs that appear in sources
    metadata: p._nEff != null ? { evidenceWeight: String(p._nEff), sources: String(p._credibleCount) } : {},
    verdict: buildVerdict(p),
    rank: p.rank,
    bestFor: buildBestFor(p),
  }));

  const category = topicalCategory || (facets && facets.category) || 'General';
  const credibleSourceCount = (sources || []).filter((s) => (s.credibility?.score ?? 0) >= 45).length;

  return {
    summary: buildSummary(query, products, topicalCategory),
    category,
    buyersGuide: buildBuyersGuide(sources || [], notes || [], products),
    products,
    methodology: `${credibleSourceCount} credible source(s) analyzed by extraction (no generative model). Products are ranked by the weight of credibility-weighted evidence; ratings are editorial estimates derived from that evidence, and any product backed only by affiliate listicles, sponsored posts, or manufacturer pages was excluded as unverified. Every price, spec, pro, and con is a span taken directly from a source — nothing is invented.`,
  };
}

// THE single honest synthesis path: deterministic extraction + the gated LLM con-selector
// (timeout-bounded so it can never stall a run). Called by BOTH runEngine (CF-side direct)
// AND handleComplete (when the off-CF gatherer hands back raw sources) so the honesty-critical
// logic lives in exactly ONE place and the blackbox can never synthesize on its own. Returns
// the enriched report; the CALLER validates (trust boundary stays at each call site).
export async function synthesizeHonest({ query, notes, sources, facets, topicalCategory, openrouterKey, conSelectorModel, cleanupModel } = {}) {
  const report = synthesizeExtractive(query, notes || [], sources || [], facets || {}, topicalCategory || '');
  // Gated LLM name-cleanup FIRST (engine-shootout-v2 winner): clean names, drop junk/platforms/
  // dupes, all constrained to the candidate set + groundedness-gated. Then the con-selector
  // enriches cons on the cleaned set. Both timeout-bounded so neither can stall a run.
  if (cleanupModel && openrouterKey) {
    try {
      await Promise.race([
        cleanProducts(report, query, topicalCategory || '', openrouterKey, cleanupModel),
        new Promise((resolve) => setTimeout(resolve, 25000)),
      ]);
    } catch (e) { console.log('[synthesizeHonest] name-cleanup skipped:', e?.message); }
  }
  if (conSelectorModel && openrouterKey) {
    try {
      await Promise.race([
        enrichConsLLM(report, sources || [], openrouterKey, conSelectorModel),
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);
    } catch (e) { console.log('[synthesizeHonest] con-selector skipped:', e?.message); }
  }
  return report;
}
