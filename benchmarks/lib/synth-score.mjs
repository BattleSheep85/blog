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
  const srcParts = [
    ...(corpus.sources || []).map((s) => `${s.title} ${s.content || ''}`),
    ...(corpus.notes || []).map((n) => n.content || ''),
  ];
  const srcText = srcParts.map(norm).join(' ');
  const srcRaw = srcParts.join(' ');
  const srcNums = nums(srcRaw);   // from raw text: norm() strips commas, which would fracture grouped numbers (e.g. "6,650" -> "6 650")

  let nameUngrounded = 0, numUngrounded = 0;
  let nameStrictUngrounded = 0;
  const nameUngList = [];
  const numUngList = [];
  const nameStrictUngList = [];
  for (const p of prods) {
    const productName = p.name || '';
    const n = norm(productName);
    if (n.length >= 4 && !srcText.includes(n)) {   // old strict signal, kept
      nameStrictUngrounded++;
      nameStrictUngList.push(productName);
    }
    const toks = n.split(' ').filter((w) => w.length >= 3 && !NAME_STOP.has(w));
    if (toks.length >= 1) {
      const present = toks.filter((w) => srcText.includes(w)).length;
      const presentRatio = present / toks.length;
      if (presentRatio < 0.5) {   // ungrounded = <50% of significant tokens in sources
        nameUngrounded++;
        nameUngList.push({ product: productName, presentRatio });
      }
    }
    if (typeof p.price === 'number' && !srcNums.some((s) => close(p.price, s))) {
      numUngrounded++;
      numUngList.push({ product: productName, field: 'price', value: p.price, number: p.price });
    }
    for (const [field, v] of Object.entries(p.specs || {})) {
      for (const x of nums(String(v))) {
        if (!srcNums.some((s) => close(x, s))) {
          numUngrounded++;
          numUngList.push({ product: productName, field, value: v, number: x });
        }
      }
    }
  }
  const avg = (f) => prods.length ? Math.round(10 * prods.reduce((s, p) => s + f(p), 0) / prods.length) / 10 : 0;
  return {
    products:              prods.length,
    name_ung:              nameUngrounded,
    name_ung_list:         nameUngList,
    name_ung_strict:       nameStrictUngrounded,
    name_ung_strict_list:  nameStrictUngList,
    num_ung:               numUngrounded,
    num_ung_list:          numUngList,
    avg_pros:              avg((p) => (p.pros || []).length),
    avg_cons:              avg((p) => (p.cons || []).length),
    has_verdict:           prods.filter((p) => (p.verdict || '').length > 20).length,
    has_rating:            prods.filter((p) => typeof p.rating === 'number').length,
  };
}
