// Parallel research engine — orchestrator + concurrent sub-researchers.
//
// Replaces the sequential agent loop (engine.js) with a map-reduce shape, the
// same pattern Claude's research feature uses:
//   1. DECOMPOSE — a lead planner splits the query into N independent aspects.
//   2. FAN OUT   — N sub-researchers run CONCURRENTLY, each owning one aspect,
//                  each its own isolated `state` (so executeTool's in-place
//                  mutation never races), reusing the real tools + credibility.
//   3. REDUCE    — merge + dedup all sources/notes, then ONE synthesis.
//
// Same signature and return shape as runEngine() in engine.js, so it is a
// drop-in replacement. Wall-clock collapses from sum-of-searches to
// slowest-single-aspect; on Cloudflare it still respects the ~950-subrequest
// cap, and on the off-CF worker (track 2) concurrency/depth scale freely.

import { buildAgentTools, executeTool } from './tools.js';
import { buildAgentPrompt, buildSynthesisPrompt } from './prompts.js';
import { callLLM, callLLMStreaming } from './llm.js';
import { validateResearchResult } from './validate.js';

const SUBREQUEST_BUDGET = 950;
const SUBREQUEST_RESERVE = 10;
const PER_ASPECT_SEARCHES = 6;
const PER_ASPECT_FETCHES = 3;

async function emitEvent(onEvent, eventType, message, detail) {
  if (!onEvent) return;
  try { await onEvent(eventType, message, detail ?? null); }
  catch (err) { console.log(`[parallel] event write failed: ${err instanceof Error ? err.message : String(err)}`); }
}

// ── Bounded-concurrency pool ────────────────────────────────────────────────
// Runs `tasks` (thunks) with at most `limit` in flight. On Cloudflare this keeps
// us from spiking Serper/OpenRouter rate limits; the off-CF worker can pass a
// much higher limit via config.maxConcurrency.
async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = await tasks[i](); }
      catch (err) { console.log(`[parallel] task ${i} failed: ${err instanceof Error ? err.message : String(err)}`); results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Step 1: decompose ────────────────────────────────────────────────────────
const DECOMPOSE_SYSTEM = `You are the lead planner for an honest product-research project. Split the user's query into INDEPENDENT research aspects that can be investigated in parallel by separate researchers. Good aspects for "best X" queries: top contenders / market leaders; build quality & reliability; value picks & budget options; common complaints & failure modes; expert hands-on testing & measurements; (when relevant) warranty/support, key specs, comparisons. Each aspect must be self-contained — no aspect should depend on another's results.
Output ONLY JSON: {"aspects":[{"title":"<short>","focus":"<one sentence telling the researcher exactly what to find>"}]}.`;

async function decompose(query, openrouterKey, plannerModel, nAspects) {
  const messages = [
    { role: 'system', content: DECOMPOSE_SYSTEM },
    { role: 'user', content: `Query: "${query}"\nProduce exactly ${nAspects} aspects.` },
  ];
  let costUsd = 0;
  try {
    const resp = await callLLM(openrouterKey, plannerModel, messages);
    if (Number.isFinite(resp.usage?.cost)) costUsd = resp.usage.cost;
    const raw = resp.choices?.[0]?.message?.content ?? '';
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse((m ? m[1] : raw).trim());
    const aspects = Array.isArray(parsed.aspects) ? parsed.aspects.filter((a) => a && a.title).slice(0, nAspects) : [];
    if (aspects.length >= 2) return { aspects, costUsd };
  } catch (err) {
    console.log(`[parallel] decompose failed, using fallback aspects: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Fallback: a generic aspect set so research never dies on a decompose miss.
  return {
    costUsd,
    aspects: [
      { title: 'Top contenders', focus: `Find the most-recommended ${query} from expert and hands-on sources.` },
      { title: 'Value picks', focus: `Find the best budget / best-value options for: ${query}.` },
      { title: 'Reliability & complaints', focus: `Find common complaints, failure modes, and long-term reliability issues for ${query}.` },
      { title: 'Expert testing', focus: `Find hands-on lab tests and measured comparisons for ${query}.` },
    ].slice(0, nAspects),
  };
}

// ── Step 2: one sub-researcher (isolated state, small bounded agent loop) ────
async function runSubResearcher(aspect, query, subConfig, openrouterKey, toolCtx, agentTools, budget, onEvent) {
  const state = { searchCount: 0, fetchCount: 0, toolCallCount: 0, sources: [], notes: [], totalCostUsd: 0 };
  const messages = [
    { role: 'system', content: buildAgentPrompt(query, subConfig, toolCtx.facets) },
    { role: 'user', content: `Research ONE specific aspect of "${query}": ${aspect.title} — ${aspect.focus}\n\nDo up to ${subConfig.maxSearches} searches across different providers, read_page the most credible ([hands-on]/[expert-domain]) sources, and call note() for every useful finding (with source attribution). Stop when this aspect is covered.` },
  ];
  await emitEvent(onEvent, 'search', `Researching: ${aspect.title}`);

  const MAX_TURNS = subConfig.maxToolCalls + 3;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (state.toolCallCount >= subConfig.maxToolCalls) break;
    if (budget.used >= SUBREQUEST_BUDGET - SUBREQUEST_RESERVE) break;

    let response;
    try {
      budget.used++; // planner LLM call = 1 subrequest
      response = await callLLM(openrouterKey, subConfig.plannerModel, messages, agentTools);
      if (Number.isFinite(response.usage?.cost)) state.totalCostUsd += response.usage.cost;
    } catch (err) {
      console.log(`[parallel:${aspect.title}] LLM error: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    const choice = response.choices?.[0];
    const toolCalls = choice?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break; // aspect done

    messages.push({ role: 'assistant', content: choice.message.content ?? null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      if (state.toolCallCount >= subConfig.maxToolCalls || budget.used >= SUBREQUEST_BUDGET - SUBREQUEST_RESERVE) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Budget reached for this aspect; finish up.' });
        continue;
      }
      state.toolCallCount++;
      const [result, subs] = await executeTool(tc, state, subConfig, toolCtx);
      budget.used += subs;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }
  await emitEvent(onEvent, 'status', `Done: ${aspect.title} (${state.sources.length} sources, ${state.notes.length} findings)`);
  return state;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function runParallelEngine(query, config, openrouterKey, env, onEvent, facets, topicalCategory, clarifications) {
  const recencySensitive = facets?.recency_sensitive ?? true;
  const toolCtx = { env, recencySensitive, facets };
  const agentTools = buildAgentTools(facets);
  const budget = { used: 0 }; // shared subrequest counter (CF ~950 cap)
  let totalCostUsd = 0;

  const nAspects = Math.max(4, Math.min(12, Math.round((config.maxSearches ?? 50) / PER_ASPECT_SEARCHES)));
  const maxConcurrency = config.maxConcurrency ?? 6;

  await emitEvent(onEvent, 'status', `Planning ${nAspects} research angles...`);

  // 1. Decompose
  const { aspects, costUsd: decomposeCost } = await decompose(query, openrouterKey, config.plannerModel, nAspects);
  budget.used++; // decompose LLM call
  totalCostUsd += decomposeCost;
  await emitEvent(onEvent, 'status', `Researching ${aspects.length} angles in parallel: ${aspects.map((a) => a.title).join(', ')}`);

  // 2. Fan out — concurrent sub-researchers, each isolated state.
  const subConfig = {
    ...config,
    maxSearches: PER_ASPECT_SEARCHES,
    maxFetches: PER_ASPECT_FETCHES,
    maxToolCalls: PER_ASPECT_SEARCHES + PER_ASPECT_FETCHES + 4,
  };
  const tasks = aspects.map((aspect) => () =>
    runSubResearcher(aspect, query, subConfig, openrouterKey, toolCtx, agentTools, budget, onEvent));
  const subStates = (await runPool(tasks, maxConcurrency)).filter(Boolean);

  // 3. Reduce — merge + dedup sources by url; concat notes.
  const sources = [];
  const notes = [];
  const seenUrls = new Set();
  for (const st of subStates) {
    totalCostUsd += st.totalCostUsd ?? 0;
    for (const s of st.sources ?? []) { if (!seenUrls.has(s.url)) { seenUrls.add(s.url); sources.push(s); } }
    for (const n of st.notes ?? []) notes.push(n);
  }
  console.log(`[parallel] fan-out done: ${aspects.length} aspects, ${sources.length} unique sources, ${notes.length} notes, ${budget.used} subreqs`);
  await emitEvent(onEvent, 'status', `Gathered ${sources.length} sources with ${notes.length} findings. Synthesizing report...`);

  // 4. Synthesis (same contract as engine.js phase 2).
  await emitEvent(onEvent, 'synthesize', 'Writing final report...');
  const synthPrompt = buildSynthesisPrompt(query, notes, sources, config, facets, topicalCategory, clarifications);
  const synthMessages = [
    { role: 'system', content: synthPrompt },
    { role: 'user', content: `Write the research report for: "${query}". Respond ONLY with valid JSON.` },
  ];
  const announced = new Set();
  const announceProduct = (fullText) => {
    const re = /"name"\s*:\s*"([^"\\]{3,120}?)"/g;
    let m;
    while ((m = re.exec(fullText)) !== null) {
      const name = m[1].trim();
      if (name && !announced.has(name)) { announced.add(name); void emitEvent(onEvent, 'synthesize', `Writing section: ${name}`); }
    }
  };

  let synthContent = '';
  try {
    const streamRes = await callLLMStreaming(openrouterKey, config.synthModel, synthMessages, (_d, acc) => announceProduct(acc), config.synthReasoning, config.synthMaxTokens);
    synthContent = streamRes.content;
    if (Number.isFinite(streamRes.usage?.cost)) totalCostUsd += streamRes.usage.cost;
  } catch (err) {
    console.error('[parallel] synth stream failed:', err instanceof Error ? err.message : String(err));
    const retry = await callLLM(openrouterKey, config.synthModel, synthMessages, undefined, config.synthReasoning, config.synthMaxTokens);
    if (Number.isFinite(retry.usage?.cost)) totalCostUsd += retry.usage.cost;
    synthContent = retry.choices?.[0]?.message?.content ?? '';
  }
  if (!synthContent) throw new Error('No synthesis response from LLM');

  const extractJson = (raw) => {
    let s = raw.trim();
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) s = m[1].trim();
    try { return JSON.parse(s); } catch { return null; }
  };
  let parsed = extractJson(synthContent);
  if (parsed === null) {
    console.warn('[parallel] streamed JSON unparseable, retrying non-streaming');
    const retry = await callLLM(openrouterKey, config.synthModel, synthMessages, undefined, config.synthReasoning, config.synthMaxTokens);
    if (Number.isFinite(retry.usage?.cost)) totalCostUsd += retry.usage.cost;
    parsed = extractJson(retry.choices?.[0]?.message?.content ?? '');
    if (parsed === null) throw new Error('Invalid JSON from synthesis');
  }

  const result = validateResearchResult(parsed);
  await emitEvent(onEvent, 'status', `Report complete: ${result.products.length} products ranked.`);

  return { result, sources, notes, totalCostUsd, synthModel: config.synthModel };
}
