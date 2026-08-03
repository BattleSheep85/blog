// Engine architecture shootout v2 — decides ML vs gated-LLM-cleanup vs full-LLM+verify.
// Runs all three on the SAME cached corpus, captures each report + a deterministic GROUNDING
// score (fabrication check). A separate judge workflow scores QUALITY (clean names, relevance).
//
//   A  pure-ML        synthesizeExtractive (current prod)
//   B  gated cleanup  ML candidates → LLM cleans names / drops fragments+platforms / dedups,
//                     CONSTRAINED to the ML set + a groundedness gate (no invented name tokens)
//   C  LLM + verify   LLM writes the report from sources → drop any product whose name is not
//                     grounded in the source text (the honesty gate)
import { readFileSync, writeFileSync } from 'node:fs';
import { synthesizeExtractive } from '../worker/engine/extract/index.js';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { callLLM } from '../worker/engine/llm.js';
import { validateResearchResult } from '../worker/engine/validate.js';
import { ENGINE_CONFIG } from '../worker/lib/engine-config.js';

const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const KEY = e.OPENROUTER_API_KEY;
const CONFIG = ENGINE_CONFIG;
const MODEL = 'google/gemini-2.5-flash'; // capable + cheap; the verify gate enforces honesty regardless

// ── grounding metric (from the original shootout) ──────────────────────────────
const gNorm = (s) => String(s || '').toLowerCase().replace(/&#?[a-z0-9]+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const numbersIn = (t) => { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; };
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
function corpusTextOf(corpus) { return ' ' + [...(corpus.sources || []).map((s) => `${s.title} ${s.content}`), ...(corpus.notes || []).map((n) => n.content)].map(gNorm).join(' ') + ' '; }
function metrics(report, corpus) {
  const prods = report.products || [];
  const srcNums = numbersIn((corpus.sources || []).map((s) => s.content || '').join(' '));
  const cText = corpusTextOf(corpus);
  let nameUngrounded = 0, numUngrounded = 0;
  for (const p of prods) {
    const g = gNorm(p.name); if (g.length >= 4 && !cText.includes(g)) nameUngrounded++;
    if (typeof p.price === 'number' && !grounded(p.price, srcNums)) numUngrounded++;
    for (const v of Object.values(p.specs || {})) for (const n of numbersIn(String(v))) if (!grounded(n, srcNums)) numUngrounded++;
  }
  return { products: prods.length, name_ungrounded: nameUngrounded, num_ungrounded: numUngrounded, names: prods.map((p) => p.name) };
}

const extractJson = (raw) => { let s = String(raw || '').trim(); const m = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) s = m[1].trim(); try { return JSON.parse(s); } catch { return null; } };

// ── A: pure ML ──────────────────────────────────────────────────────────────
function approachA(corpus) { return synthesizeExtractive(corpus.query, corpus.notes, corpus.sources, corpus.facets, corpus.cat); }

// ── B: ML candidates → gated LLM cleanup ──────────────────────────────────────
async function approachB(corpus) {
  const ml = approachA(corpus);
  if (!ml.products.length) return ml;
  const list = ml.products.map((p, i) => `${i}: ${p.name}`).join('\n');
  const prompt = `Query: "${corpus.query}" (category: ${corpus.cat || ''}).
Below are candidate product NAMES extracted verbatim from review sources. For EACH index decide:
- keep=false if it is NOT a real, distinct product relevant to the query: a spec/feature fragment ("Standard E26 Base", "White 800 2200K", "Compact 1350W"), a platform/ecosystem ("Apple HomeKit Alexa", "Amazon Alexa"), a duplicate of another row, or off-topic.
- keep=true otherwise, and give clean_name = the real product name with merges/chrome removed.
HARD RULE: clean_name may use ONLY words that already appear in the original name — do NOT invent or add words. Output ONLY JSON {"items":[{"i":0,"keep":true,"clean_name":"..."}]}.

${list}`;
  let decisions = null;
  try {
    const r = await callLLM(KEY, MODEL, [{ role: 'user', content: prompt }], { reasoning: { effort: 'low' }, maxTokens: 4000 });
    decisions = extractJson(r.choices?.[0]?.message?.content);
  } catch (err) { process.stderr.write(`  B LLM fail: ${err.message}\n`); }
  if (!decisions || !Array.isArray(decisions.items)) return ml; // fail-safe: keep ML output
  const byI = new Map(decisions.items.map((d) => [d.i, d]));
  const kept = [];
  for (let i = 0; i < ml.products.length; i++) {
    const d = byI.get(i);
    if (!d || d.keep === false) continue;
    let name = ml.products[i].name;
    if (typeof d.clean_name === 'string' && d.clean_name.trim()) {
      // GROUNDEDNESS GATE: every clean_name word must exist in the original name (no invention).
      const origWords = new Set(gNorm(name).split(' '));
      const cleanWords = gNorm(d.clean_name).split(' ').filter((w) => w.length >= 2);
      if (cleanWords.every((w) => origWords.has(w))) name = d.clean_name.trim();
    }
    kept.push({ ...ml.products[i], name });
  }
  return { ...ml, products: kept.map((p, i) => ({ ...p, rank: i + 1 })) };
}

// ── C: full LLM synth → grounding verify (drop ungrounded products) ───────────
async function approachC(corpus) {
  const synthPrompt = buildSynthesisPrompt(corpus.query, corpus.notes, corpus.sources, CONFIG, corpus.facets, corpus.cat, {});
  let parsed = null;
  try {
    const r = await callLLM(KEY, MODEL, [
      { role: 'system', content: synthPrompt },
      { role: 'user', content: `Write the research report for: "${corpus.query}". Respond ONLY with valid JSON.` },
    ], { reasoning: { effort: 'low' }, maxTokens: 16000 });
    parsed = extractJson(r.choices?.[0]?.message?.content);
  } catch (err) { process.stderr.write(`  C LLM fail: ${err.message}\n`); }
  if (!parsed) return { products: [], summary: '', methodology: '' };
  let report; try { report = validateResearchResult(parsed); } catch { return { products: [], summary: '', methodology: '' }; }
  // HONESTY GATE: drop any product whose name is not grounded in the source text.
  const cText = corpusTextOf(corpus);
  const before = report.products.length;
  report.products = report.products.filter((p) => { const g = gNorm(p.name); return g.length < 4 || cText.includes(g); });
  report._droppedUngrounded = before - report.products.length;
  return report;
}

// ── run ───────────────────────────────────────────────────────────────────────
const corpora = JSON.parse(readFileSync(new URL('./results/corpus.json', import.meta.url), 'utf8')).filter((c) => c.sources?.length);
const out = [];
for (const c of corpora) {
  process.stderr.write(`\n${c.cat || c.query.slice(0, 30)} (${c.sources.length} src):\n`);
  const A = approachA(c); const mA = metrics(A, c); process.stderr.write(`  A(ML)    ${mA.products}p, name_ungrounded=${mA.name_ungrounded}\n`);
  const B = await approachB(c); const mB = metrics(B, c); process.stderr.write(`  B(clean) ${mB.products}p, name_ungrounded=${mB.name_ungrounded}\n`);
  const C = await approachC(c); const mC = metrics(C, c); process.stderr.write(`  C(LLM+v) ${mC.products}p, name_ungrounded=${mC.name_ungrounded} (dropped ${C._droppedUngrounded || 0} ungrounded)\n`);
  out.push({ query: c.query, cat: c.cat, A: { metrics: mA }, B: { metrics: mB }, C: { metrics: mC } });
}
writeFileSync(new URL('./results/engine-v2.json', import.meta.url), JSON.stringify(out, null, 2));
// totals
const sum = (k, ap) => out.reduce((s, r) => s + r[ap].metrics[k], 0);
process.stderr.write(`\n=== TOTALS (8 queries) ===\n`);
for (const ap of ['A', 'B', 'C']) process.stderr.write(`  ${ap}: ${sum('products', ap)} products, ${sum('name_ungrounded', ap)} ungrounded names\n`);
process.stderr.write(`saved engine-v2.json\n`);
