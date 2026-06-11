// Types erased — Tier and ResearchConfig were TS-only types in the source
// (../types). Their runtime shape is the plain objects defined below.

export const TIER_CONFIGS = {
  instant: {
    maxToolCalls: 12,
    maxSearches: 8,
    maxFetches: 0,
    agentLoopBudgetMs: 30_000,
    synthModel: 'anthropic/claude-haiku-4.5',
    plannerModel: 'google/gemini-2.5-flash',
    reportSections: ['summary', 'products', 'methodology'],
    requireTurnstile: false,
    requireSubscription: false,
  },
  full: {
    maxToolCalls: 18,
    maxSearches: 12,
    maxFetches: 3,
    agentLoopBudgetMs: 25_000,
    synthModel: 'anthropic/claude-sonnet-4.6',
    plannerModel: 'google/gemini-2.5-flash',
    reportSections: ['summary', 'products', 'comparison', 'methodology'],
    requireTurnstile: false,
    requireSubscription: false,
  },
  exhaustive: {
    maxToolCalls: 50,
    maxSearches: 30,
    maxFetches: 15,
    agentLoopBudgetMs: 180_000,
    synthModel: 'anthropic/claude-opus-4.7',
    plannerModel: 'google/gemini-2.5-flash',
    synthReasoningEffort: 'medium',
    reportSections: ['summary', 'products', 'comparison', 'categories', 'pitfalls', 'buyerGuide', 'methodology'],
    requireTurnstile: true,
    requireSubscription: false,
  },
  unbound: {
    maxToolCalls: 250,
    maxSearches: 150,
    maxFetches: 100,
    agentLoopBudgetMs: 1_800_000,
    synthModel: 'anthropic/claude-opus-4.7',
    plannerModel: 'google/gemini-2.5-flash',
    synthReasoningEffort: 'high',
    reportSections: ['summary', 'products', 'comparison', 'categories', 'pitfalls', 'buyerGuide', 'methodology'],
    requireTurnstile: true,
    requireSubscription: true,
  },
};

// Tiers exposed to anonymous/public traffic. exhaustive/unbound stay gated
// behind Turnstile/subscription and are not selectable by the public UI.
export const PUBLIC_TIERS = ['instant', 'full'];

export function getTierConfig(tier) {
  return TIER_CONFIGS[tier];
}

export function isValidTier(value) {
  return value === 'instant' || value === 'full' || value === 'exhaustive' || value === 'unbound';
}
