// SINGLE ENGINE CONFIG — tiers collapsed to one stack (2026-06-16).
//
// One model set, one research depth, for every run. No more instant/full/
// exhaustive. Benchmark-derived (see benchmarks/engine-llm-bench-2026-06.md):
//   - classifier: google/gemini-2.5-flash-lite  (set in worker/lib/classifier.js)
//   - planner:    google/gemini-2.5-flash        (perfect skepticism + tool-calls,
//                 cheapest + fastest; the feared "15% BS" failure did not reproduce)
//   - synthesis:  moonshotai/kimi-k2.6           (matched opus-4.8's PERFECT honesty
//                 in the bench at ~1/9 the cost and 2.7x the speed)
//
// Depth is tuned to "deep & sustainable" within Cloudflare's per-run limits
// (~950 subrequests, ~20-min reaper). The off-Cloudflare research worker
// (track 2) removes that ceiling so depth/parallelism can scale much higher.

const ENGINE_CONFIG = {
  maxToolCalls: 70,
  maxSearches: 50,
  maxFetches: 20,
  agentLoopBudgetMs: 210_000, // ~3.5 min, safely under the 20-min reaper
  synthModel: 'moonshotai/kimi-k2.6',
  plannerModel: 'google/gemini-2.5-flash',
  // kimi-k2.6 reasons by default and would burn the whole synth token budget on
  // reasoning before emitting the report JSON (empty synthesis on large prompts).
  // Turn thinking OFF for synthesis and give the report a generous token ceiling.
  synthReasoning: { enabled: false },
  synthMaxTokens: 16000,
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
  return value === 'instant' || value === 'full' || value === 'exhaustive' || value === 'unbound';
}
