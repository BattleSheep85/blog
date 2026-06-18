// Pure-ML extraction synthesizer (Phase 0) — DROP-IN for the LLM synthesis step.
// Same inputs (query, notes, sources, facets, topicalCategory) and same output JSON
// shape as buildSynthesisPrompt's report, so validate.js + the frontend are unchanged.
// It cannot fabricate: every field is extracted from, or templated around, real
// source spans. No deps; runs in the Worker in ~tens of ms.

import { analyze } from './engine.js';
import { buildVerdict, buildBestFor, buildSummary, buildBuyersGuide } from './prose.js';

export function synthesizeExtractive(query, notes, sources, facets = {}, topicalCategory = '') {
  const ranked = analyze(query, notes || [], sources || []);

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
