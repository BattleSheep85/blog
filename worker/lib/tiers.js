// SINGLE ENGINE CONFIG — tiers collapsed to one stack (2026-06-16).
//
// One model set, one research depth, for every run. No more instant/full/
// exhaustive. Benchmark-derived (see benchmarks/engine-llm-bench-2026-06.md):
//   - classifier: google/gemini-2.5-flash-lite  (set in worker/lib/classifier.js)
//   - planner:    google/gemini-2.5-flash        (perfect skepticism + tool-calls,
//                 cheapest + fastest; the feared "15% BS" failure did not reproduce)
//   - synthesis:  openai/gpt-5.4-mini            (locked 2026-06-29; won the 50-query
//                 blind juror panel — see synthModel comment below)
//
// Depth is tuned to "deep & sustainable" within Cloudflare's per-run limits
// (~950 subrequests, ~20-min reaper). The off-Cloudflare research worker
// (track 2) removes that ceiling so depth/parallelism can scale much higher.

const ENGINE_CONFIG = {
  maxToolCalls: 70,
  maxSearches: 50,
  maxFetches: 20,
  agentLoopBudgetMs: 210_000, // ~3.5 min, safely under the 20-min reaper
  // Synth model = openai/gpt-5.4-mini (locked in 2026-06-26). Won the 50-query ×
  // 150-juror blind judge panel on real Google searches: best grounding (7.18) +
  // usefulness (7.31), ranked #1 in 53% of head-to-heads, near-cleanest fabrication
  // rate. Beat kimi-k2.6, grok-4.20 (DQ'd on honesty, 3.15 fabs/report), gemini-flash
  // (honest but thin), flash-lite. Bench: benchmarks/bench-synth-v2.mjs + judge panel.
  synthModel: 'openai/gpt-5.4-mini',
  plannerModel: 'google/gemini-2.5-flash',
  // gpt-5.4-mini does not take a reasoning param in the bench config (undefined).
  synthReasoning: undefined,
  synthMaxTokens: 16000,
  // ── speed knobs (OpenRouter platform levers) ──────────────────────────────
  // The agent loop is tool-ROUTING, not deep reasoning — cap thinking tokens per
  // turn. Biggest accuracy-safe wall-clock lever on the sequential MAX_TURNS path.
  plannerReasoning: { effort: 'low' },
  // Hybrid con-SELECTOR model (used only when the engine runs SYNTH_ENGINE=extract):
  // a cheap model PICKS criticism from real source spans for products the deterministic
  // pass left thin; its groundedness gate drops anything not verbatim, so it adds con
  // recall without a fabrication surface. flash-lite is plenty for selection.
  conSelectorModel: 'google/gemini-2.5-flash-lite',
  // Gated LLM name-cleanup model (engine-shootout-v2 winner): cleans names + drops junk/
  // platforms/dupes over the ML candidate set, groundedness-gated. Stronger than flash-lite
  // (needs product/category understanding), still cheap (~$0.01/run).
  cleanupModel: 'google/gemini-2.5-flash',
  // Recall-supplement model (engine-shootout-v2 "C win"): proposes category leaders the harvest
  // missed; grounding-gated downstream (the name must appear in the gathered sources with credible
  // evidence, else it's dropped). Knowledge task → gemini-2.5-flash, ~$0.01/run.
  recallModel: 'google/gemini-2.5-flash',
  // NO provider object for the planner: gemini-2.5-flash is served by a SINGLE
  // provider (Google) on OpenRouter that does not expose a quantization tag, so a
  // `quantizations` filter 404s ("no endpoints"), and sort/max_price can only hurt
  // (filter to zero) with no routing benefit. The planner's real speed lever is
  // reasoning:{effort:'low'} above. Verified empirically 2026-06-22.
  plannerProvider: null,
  // gpt-5.4-mini is a single-provider (OpenAI) model on OpenRouter with no
  // quantization tag, so the kimi-era throughput/quantization routing object would
  // 404 ("no endpoints") or filter to zero. No provider routing for the synth now.
  synthProvider: null,
  // Cap a hung planner routing turn well below the synth budget (the loop retries
  // once on error, so a rare false abort self-heals). gemini tool turns finish in s.
  plannerHardMs: 45_000,
  maxConcurrency: 6, // parallel sub-researchers (raised on the off-CF worker)
  reportSections: ['summary', 'products', 'comparison', 'categories', 'pitfalls', 'buyerGuide', 'methodology'],
  requireTurnstile: false,
  requireSubscription: false,
};

// Tiers are collapsed: every tier key resolves to the SAME config, so existing
// callers that still pass 'instant'/'full'/'exhaustive'/'unbound' keep working
// unchanged — they all now run the one stack above.
export const TIER_CONFIGS = {
  instant: ENGINE_CONFIG,
  full: ENGINE_CONFIG,
  exhaustive: ENGINE_CONFIG,
  unbound: ENGINE_CONFIG,
};

// Kept for the public UI / validation surface; all entries behave identically now.
export const PUBLIC_TIERS = ['instant', 'full'];

export function getTierConfig(tier) {
  return TIER_CONFIGS[tier] ?? ENGINE_CONFIG;
}

export function isValidTier(value) {
  return PUBLIC_TIERS.includes(value);
}
