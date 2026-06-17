// Parallel research engine v2 — burst, not loops.
//
// The lead planner decomposes the query into aspects WITH search queries, then
// the engine fires EVERY search in parallel, reads the top credible pages in
// parallel, extracts findings in a few batched LLM calls, and synthesizes once.
// ~3-5 LLM calls total (vs ~50 for an agent loop), so wall-clock is dominated by
// parallel I/O + synthesis, depth scales for ~free, and there are no runaway
// loops. Same signature + return shape as runEngine() (drop-in). Built for the
// off-Cloudflare worker, where concurrency/depth aren't capped.

import { runSearch, readPageInto } from './tools.js';
import { buildSynthesisPrompt } from './prompts.js';
import { callLLM, callLLMStreaming } from './llm.js';
import { validateResearchResult } from './validate.js';

const PER_ASPECT_QUERIES = 5;
const PROVIDERS = ['web', 'web', 'duckduckgo', 'rss', 'video', 'news'];
const SEARCH_CONCURRENCY = 24;
const READ_CONCURRENCY = 16;
const MAX_READ = 24;
const READ_MIN_SCORE = 45;     // read [community]/[hands-on]/[expert] incl. hands-on+expert that
                               // also monetize (base50+hands-on25+expert15-affiliate45=45); synth
                               // still discounts affiliate-conflicted verdicts. Pure affiliate
                               // listicles (~5) stay skipped. Bounded by MAX_READ regardless.
const NOTE_BATCH = 4;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function emit(onEvent, type, msg) { if (!onEvent) return; try { await onEvent(type, msg, null); } catch { /* */ } }

// Bounded-concurrency pool (thunks). Failures resolve to null.
async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = await tasks[i](); } catch { results[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) || 1 }, worker));
  return results;
}

// ── Step 1: decompose into aspects WITH search queries ──────────────────────
const DECOMPOSE_SYSTEM = `You are the lead planner for an honest product-research project. Break the user's query into independent research aspects, and for EACH aspect write concrete web search queries that would surface credible evidence (expert reviews, hands-on tests, owner complaints, prices). Good aspects: top contenders, build quality & reliability, value picks, common complaints & failure modes, expert hands-on testing, key specs/features. Make queries specific (include the product type, year, "review", "vs", "problems", "best", price bands). Output ONLY JSON: {"aspects":[{"title":"<short>","queries":["q1","q2",...]}]}.`;

async function decompose(query, key, plannerModel, nAspects, perAspect) {
  const messages = [
    { role: 'system', content: DECOMPOSE_SYSTEM },
    { role: 'user', content: `Query: "${query}"\nProduce exactly ${nAspects} aspects, each with ${perAspect} search queries.` },
  ];
  let cost = 0;
  try {
    const resp = await callLLM(key, plannerModel, messages);
    if (Number.isFinite(resp.usage?.cost)) cost = resp.usage.cost;
    const raw = resp.choices?.[0]?.message?.content ?? '';
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse((m ? m[1] : raw).trim());
    const aspects = Array.isArray(parsed.aspects)
      ? parsed.aspects.filter((a) => a && a.title && Array.isArray(a.queries) && a.queries.length).slice(0, nAspects)
      : [];
    if (aspects.length >= 2) return { aspects, cost };
  } catch { /* fall through to deterministic fallback */ }
  return {
    cost,
    aspects: [
      { title: 'Top contenders', queries: [`best ${query} ${new Date().getUTCFullYear()}`, `${query} expert review`, `${query} top picks comparison`] },
      { title: 'Value picks', queries: [`best budget ${query}`, `${query} best value review`] },
      { title: 'Reliability & complaints', queries: [`${query} common problems reliability`, `${query} complaints reddit`] },
      { title: 'Hands-on testing', queries: [`${query} hands-on test rtings wirecutter`, `${query} measured comparison`] },
    ].slice(0, nAspects),
  };
}

// ── Step 4: batched finding extraction from full read pages ─────────────────
const NOTE_SYSTEM = `You extract factual research findings for an honest product report. From the source pages below (each prefixed with its credibility tags), write concise notes: product names, specs, measured results, prices, pros, cons, and known issues — each with the source it came from. Respect credibility: treat [listicle]/[affiliate-conflict]/[manufacturer] claims as marketing, never launder hype as fact. Output ONLY JSON: {"notes":[{"category":"product|comparison|issue|pricing|recommendation","content":"<finding with source attribution>"}]}.`;

async function extractNotes(query, batch, key, plannerModel) {
  const block = batch.map((s, i) => {
    const tags = (s.credibility?.tags || []).map((t) => `[${t}]`).join('');
    return `### SOURCE ${i + 1} ${tags} ${s.title}\n${s.url}\n${(s.content || '').slice(0, 2200)}`;
  }).join('\n\n');
  const messages = [
    { role: 'system', content: NOTE_SYSTEM },
    { role: 'user', content: `Query: "${query}"\n\n${block}` },
  ];
  try {
    const resp = await callLLM(key, plannerModel, messages, undefined, undefined, 2000);
    const cost = Number.isFinite(resp.usage?.cost) ? resp.usage.cost : 0;
    const raw = resp.choices?.[0]?.message?.content ?? '';
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse((m ? m[1] : raw).trim());
    return { notes: Array.isArray(parsed.notes) ? parsed.notes.filter((n) => n && n.content) : [], cost };
  } catch { return { notes: [], cost: 0 }; }
}

// ── Main ────────────────────────────────────────────────────────────────────
export async function runParallelEngine(query, config, openrouterKey, env, onEvent, facets, topicalCategory, clarifications) {
  const recency = facets?.recency_sensitive ?? true;
  const toolEnv = env;
  let totalCostUsd = 0;

  const target = config.maxSearches ?? 50;
  const nAspects = clamp(Math.round(target / PER_ASPECT_QUERIES), 4, 16);

  await emit(onEvent, 'status', `Planning ${nAspects} research angles...`);
  const { aspects, cost: dc } = await decompose(query, openrouterKey, config.plannerModel, nAspects, PER_ASPECT_QUERIES);
  totalCostUsd += dc;

  // Flatten to (query, provider) tasks; cycle providers for source diversity.
  const tasks = [];
  for (const a of aspects) {
    (a.queries || []).slice(0, PER_ASPECT_QUERIES).forEach((q, i) => {
      tasks.push({ q: typeof q === 'string' ? q : q.q, provider: PROVIDERS[i % PROVIDERS.length] });
    });
  }
  await emit(onEvent, 'status', `Searching ${tasks.length} queries across ${aspects.length} angles in parallel...`);

  // 2. Parallel search burst → dedup by url.
  const searchResults = await runPool(tasks.map((t) => () => runSearch(t.q, t.provider, toolEnv, recency)), SEARCH_CONCURRENCY);
  const byUrl = new Map();
  for (const arr of searchResults) for (const s of (arr || [])) if (s?.url && !byUrl.has(s.url)) byUrl.set(s.url, s);
  const sources = [...byUrl.values()];
  if (sources.length === 0) {
    // Honest non-result: never synthesize products from zero evidence. Empty
    // products → persistEngineResult marks the run 'failed' (no published guess),
    // and we skip a wasted synthesis call.
    await emit(onEvent, 'status', 'No sources found — recording an honest non-result.');
    return { result: { summary: '', category: topicalCategory || '', products: [], methodology: 'No sources found for this query.' }, sources, notes: [], totalCostUsd, synthModel: config.synthModel };
  }
  await emit(onEvent, 'status', `Gathered ${sources.length} sources. Reading the most credible pages...`);

  // 3. Parallel read of the top credible sources (full text → better notes + scoring).
  const toRead = [...sources]
    .filter((s) => (s.credibility?.score ?? 0) >= READ_MIN_SCORE)
    .sort((a, b) => (b.credibility?.score ?? 0) - (a.credibility?.score ?? 0))
    .slice(0, MAX_READ);
  await runPool(toRead.map((s) => () => readPageInto(s, toolEnv)), READ_CONCURRENCY);

  // 4. Batched finding extraction from the pages that actually returned body text.
  const readOk = toRead.filter((s) => (s.content?.length ?? 0) > 300);
  await emit(onEvent, 'status', `Extracting findings from ${readOk.length} pages...`);
  const noteRes = await runPool(chunk(readOk, NOTE_BATCH).map((b) => () => extractNotes(query, b, openrouterKey, config.plannerModel)), 6);
  const notes = [];
  for (const r of noteRes) { if (!r) continue; totalCostUsd += r.cost || 0; for (const n of r.notes) notes.push(n); }
  console.log(`[parallel] ${aspects.length} aspects, ${tasks.length} searches, ${sources.length} sources, ${readOk.length} read, ${notes.length} notes`);

  // 5. Synthesis (kimi, reasoning off — see tiers.js).
  await emit(onEvent, 'synthesize', 'Writing final report...');
  const synthPrompt = buildSynthesisPrompt(query, notes, sources, config, facets, topicalCategory, clarifications);
  const synthMessages = [
    { role: 'system', content: synthPrompt },
    { role: 'user', content: `Write the research report for: "${query}". Respond ONLY with valid JSON.` },
  ];
  const announced = new Set();
  const announceProduct = (full) => {
    const re = /"name"\s*:\s*"([^"\\]{3,120}?)"/g; let m;
    while ((m = re.exec(full)) !== null) { const n = m[1].trim(); if (n && !announced.has(n)) { announced.add(n); void emit(onEvent, 'synthesize', `Writing section: ${n}`); } }
  };

  let synthContent = '';
  try {
    const sr = await callLLMStreaming(openrouterKey, config.synthModel, synthMessages, (_d, acc) => announceProduct(acc), config.synthReasoning, config.synthMaxTokens);
    synthContent = sr.content;
    if (Number.isFinite(sr.usage?.cost)) totalCostUsd += sr.usage.cost;
  } catch (err) {
    console.error('[parallel] synth stream failed:', err instanceof Error ? err.message : String(err));
    const retry = await callLLM(openrouterKey, config.synthModel, synthMessages, undefined, config.synthReasoning, config.synthMaxTokens);
    if (Number.isFinite(retry.usage?.cost)) totalCostUsd += retry.usage.cost;
    synthContent = retry.choices?.[0]?.message?.content ?? '';
  }
  if (!synthContent) throw Object.assign(new Error('No synthesis response from LLM'), { totalCostUsd });

  const extractJson = (raw) => { let s = raw.trim(); const m = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) s = m[1].trim(); try { return JSON.parse(s); } catch { return null; } };
  let parsed = extractJson(synthContent);
  if (parsed === null) {
    console.warn('[parallel] streamed JSON unparseable, retrying non-streaming');
    const retry = await callLLM(openrouterKey, config.synthModel, synthMessages, undefined, config.synthReasoning, config.synthMaxTokens);
    if (Number.isFinite(retry.usage?.cost)) totalCostUsd += retry.usage.cost;
    parsed = extractJson(retry.choices?.[0]?.message?.content ?? '');
    if (parsed === null) throw Object.assign(new Error('Invalid JSON from synthesis'), { totalCostUsd });
  }

  let result;
  try { result = validateResearchResult(parsed); }
  catch (e) { throw Object.assign(e, { totalCostUsd }); }
  await emit(onEvent, 'status', `Report complete: ${result.products.length} products ranked.`);
  return { result, sources, notes, totalCostUsd, synthModel: config.synthModel };
}
