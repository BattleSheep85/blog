// Gated LLM name-cleanup — the engine-shootout-v2 winner (approach B). The ML harvest is
// comprehensive + honest but its NAMES are rough (merges, chrome, fragments) and it keeps
// non-product junk (platforms, spec callouts). This adds the UNDERSTANDING the pure-ML
// heuristics can't: an LLM cleans each name + drops clear junk + dedups — CONSTRAINED to the
// ML candidate set (it can never invent a product) and PER-NAME groundedness-gated (a cleaned
// name may only use words already in the original). Conservative on drops (keep when unsure)
// so real products aren't lost. Selects + cleans, never generates.
import { callLLM } from '../llm.js';

const gNorm = (s) => String(s || '').toLowerCase().replace(/&#?[a-z0-9]+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const extractJson = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  let s = String(raw || '').trim(); const m = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) s = m[1].trim();
  try { return JSON.parse(s); } catch { return null; }
};

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['i', 'keep', 'clean_name'],
    properties: { i: { type: 'integer' }, keep: { type: 'boolean' }, clean_name: { type: 'string' } },
  } } },
};

export async function cleanProducts(report, query, topicalCategory, apiKey, model) {
  if (!apiKey || !model || !report || !Array.isArray(report.products) || report.products.length === 0) return report;
  const list = report.products.map((p, i) => `${i}: ${p.name}`).join('\n');
  const messages = [{
    role: 'user',
    content: `Query: "${query}" (category: ${topicalCategory || ''}).
Below are candidate product names extracted verbatim from review sources. For EVERY index decide:
- keep=false ONLY if it is clearly NOT a real, distinct product for THIS query: a spec/feature fragment ("Standard E26 Base", "Affordable IPX7", "White 800 2200K", "Kit Glasses", "Amazon See"), a platform/ecosystem rather than a product ("Apple HomeKit Alexa", "Amazon Alexa"), an obvious duplicate of another row, or off-topic for the category (a coffee GRINDER in an espresso-MACHINE query). When you are UNSURE, keep=true — never drop a plausibly real product.
- keep=true otherwise, with clean_name = the real product name with any two-product merge split off and chrome/review words removed.
HARD RULE: clean_name may use ONLY words that already appear in that row's original name; do NOT add, translate, or invent words. Return one entry per index.

${list}`,
  }];
  let decisions;
  try {
    const r = await callLLM(apiKey, model, messages, {
      reasoning: { effort: 'low' }, maxTokens: 6000,
      responseFormat: { type: 'json_schema', json_schema: { name: 'cleanup', strict: true, schema: SCHEMA } },
    });
    decisions = extractJson(r.choices?.[0]?.message?.content);
  } catch (e) { console.log('[name-cleaner] skipped:', e?.message); return report; }
  if (!decisions || !Array.isArray(decisions.items)) return report;
  const byI = new Map(decisions.items.map((d) => [d.i, d]));
  const kept = [];
  for (let i = 0; i < report.products.length; i++) {
    const d = byI.get(i);
    if (d && d.keep === false) continue; // explicit drop; missing decision → keep (fail-safe)
    const p = report.products[i];
    let name = p.name;
    if (d && typeof d.clean_name === 'string' && d.clean_name.trim()) {
      // GROUNDEDNESS GATE: every cleaned word must already exist in the original name.
      const orig = new Set(gNorm(name).split(' '));
      const clean = gNorm(d.clean_name).split(' ').filter((w) => w.length >= 2);
      if (clean.length && clean.every((w) => orig.has(w))) name = d.clean_name.trim();
    }
    kept.push({ ...p, name });
  }
  if (!kept.length) return report; // never empty the report on a bad LLM response
  report.products = kept.map((p, i) => ({ ...p, rank: i + 1 }));
  return report;
}
