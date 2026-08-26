// no-anthropic-on-openrouter.mjs — guard against sending an Anthropic model
// id to OpenRouter from a benchmark script.
//
// THE OWNER'S RULE (2026-07-29): any Anthropic model used for benchmark
// judging must run through the Claude Code CLI, billed to the owner's Claude
// subscription, and must never be billed through OpenRouter. See
// benchmarks/lib/claude-code-judge.mjs for the approved transport.
//
// Call this immediately before a benchmark script hands a model id to
// callLLM()/callLLMStreaming() (worker/engine/llm.js), so an accidental
// "anthropic/..." entry fails loudly instead of quietly billing OpenRouter.
//
// Scope: benchmark scripts ONLY. Do not import this from worker/ code. The
// production Worker's model choices are a separate decision the owner has
// not made yet, and the Worker cannot reach the Claude Code CLI from the
// Cloudflare edge in any case.

const ANTHROPIC_PREFIX = 'anthropic/';

export function assertNotAnthropicOnOpenRouter(modelId) {
  if (typeof modelId === 'string' && modelId.startsWith(ANTHROPIC_PREFIX)) {
    throw new Error(
      `no-anthropic-on-openrouter: model id "${modelId}" is an Anthropic model routed through `
      + 'OpenRouter. The owner\'s rule (2026-07-29) requires Anthropic judge models to run through '
      + 'the Claude Code CLI instead, billed to the subscription, never metered through OpenRouter. '
      + 'See benchmarks/lib/claude-code-judge.mjs.',
    );
  }
}
