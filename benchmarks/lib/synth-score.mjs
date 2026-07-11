// synth-score.mjs — fabrication/honesty scoring shared by synth benchmarks.
//
// Extracted verbatim from bench-synth-v2.mjs so multiple benchmark harnesses
// (OpenRouter-based and Anthropic-batch-based) can score against the same
// grounding gate without duplicating logic.

export const nums = (t) => {
  const out = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m;
  while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) out.push(n); }
  return out;
};
export const close = (n, s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03);
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const NAME_STOP = new Set(['with','the','and','for','app','edition','version','size','fit','pack','set']);

export function score(report, corpus) {
  const prods = report?.products || [];
  const srcText = [
    ...(corpus.sources || []).map((s) => `${s.title} ${s.content || ''}`),
    ...(corpus.notes || []).map((n) => n.content || ''),
  ].map(norm).join(' ');
  const srcNums = nums(srcText);

  let nameUngrounded = 0, numUngrounded = 0;
  let nameStrictUngrounded = 0;
  for (const p of prods) {
    const n = norm(p.name || '');
    if (n.length >= 4 && !srcText.includes(n)) nameStrictUngrounded++;   // old strict signal, kept
    const toks = n.split(' ').filter((w) => w.length >= 3 && !NAME_STOP.has(w));
    if (toks.length >= 1) {
      const present = toks.filter((w) => srcText.includes(w)).length;
      if (present / toks.length < 0.5) nameUngrounded++;   // ungrounded = <50% of significant tokens in sources
    }
    if (typeof p.price === 'number' && !srcNums.some((s) => close(p.price, s))) numUngrounded++;
    for (const v of Object.values(p.specs || {})) {
      for (const x of nums(String(v))) { if (!srcNums.some((s) => close(x, s))) numUngrounded++; }
    }
  }
  const avg = (f) => prods.length ? Math.round(10 * prods.reduce((s, p) => s + f(p), 0) / prods.length) / 10 : 0;
  return {
    products:        prods.length,
    name_ung:        nameUngrounded,
    name_ung_strict: nameStrictUngrounded,
    num_ung:         numUngrounded,
    avg_pros:        avg((p) => (p.pros || []).length),
    avg_cons:        avg((p) => (p.cons || []).length),
    has_verdict:     prods.filter((p) => (p.verdict || '').length > 20).length,
    has_rating:      prods.filter((p) => typeof p.rating === 'number').length,
  };
}
