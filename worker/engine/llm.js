// LLM layer for the research engine. Plain ES module, ported from
// src/lib/engine-llm.ts. Types erased; runtime behavior preserved verbatim.
//
// OpenRouter API response shape (subset we actually consume) — formerly the
// OpenRouterChoice / OpenRouterUsage / OpenRouterResponse interfaces. These are
// erased structural types; the runtime objects come straight off the JSON body.

// Budget for OpenRouter calls, scaled to reasoning effort. Extended thinking
// adds a silent pre-generation phase (30-90s for 'medium', 60-180s for 'high'),
// so a fixed 120s ceiling is too tight for exhaustive/unbound tiers.
export function llmBudgetMs(effort) {
  switch (effort) {
    case 'high': return { hardMs: 360_000, chunkMs: 180_000 };
    case 'medium': return { hardMs: 240_000, chunkMs: 120_000 };
    case 'low': return { hardMs: 180_000, chunkMs: 90_000 };
    default: return { hardMs: 120_000, chunkMs: 75_000 };
  }
}

// Stream an OpenRouter completion and surface incremental content via onToken.
// Uses a per-chunk watchdog (not just overall timeout) so a stuck stream aborts
// promptly — the historical hang that motivated `await response.text()` came
// from no per-chunk deadline.
//
// StreamResult shape: { content: string, usage?: OpenRouterUsage }

// Reasoning accepts a string effort (legacy) OR a full OpenRouter reasoning
// object — e.g. { enabled: false } to turn thinking OFF for models like
// kimi-k2.6 that reason by default and would otherwise burn the entire
// max_tokens budget on reasoning before emitting any content (empty synthesis).
function normalizeReasoning(r) {
  if (!r) return null;
  return typeof r === 'string' ? { effort: r } : r;
}
function reasoningEffortOf(r) {
  return typeof r === 'string' ? r : (r && r.effort) || undefined;
}

// OpenRouter/OpenAI reject any message string containing an unpaired UTF-16
// surrogate (a lone half of an emoji/multibyte pair) with a 400 "Invalid input
// … unpaired UTF-16 surrogate", failing the whole run. These appear in truncated
// scraped page text AND can be created by slicing a string mid-pair in
// pruneMessages. Strip them at the send boundary. Immutable — returns new msgs.
function stripLoneSurrogates(s) {
  return typeof s === 'string'
    ? s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    : s;
}
export function sanitizeLLMMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => (m && typeof m.content === 'string' ? { ...m, content: stripLoneSurrogates(m.content) } : m));
}

export async function callLLMStreaming(apiKey, model, messages, onToken, opts = {}) {
  const { reasoning, maxTokens, provider, responseFormat, models, temperature, seed } = opts;
  const { hardMs, chunkMs } = llmBudgetMs(reasoningEffortOf(reasoning));
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort('hard'), hardMs);
  let chunkTimer = null;
  const armChunk = () => {
    if (chunkTimer) clearTimeout(chunkTimer);
    chunkTimer = setTimeout(() => controller.abort('chunk'), chunkMs);
  };

  console.log(`[llm-stream] calling model=${model} effort=${reasoningEffortOf(reasoning) ?? 'none'}`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://chrisputer.tech',
        'X-Title': 'Frank',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        ...(Array.isArray(models) && models.length ? { models } : { model }),
        messages: sanitizeLLMMessages(messages),
        stream: true,
        max_tokens: maxTokens ?? 8192,
        // Deterministic by default — every call previously ran at the
        // provider's default (~1.0) sampling temperature, which is why
        // identical inputs produced different results. Overridable per-call.
        temperature: temperature ?? 0,
        ...(seed !== undefined ? { seed } : {}),
        // OpenRouter emits a final SSE chunk carrying the full usage object
        // (prompt/completion tokens + cost in USD) when this is set. Needed
        // for research.cost_usd accounting.
        stream_options: { include_usage: true },
        ...(normalizeReasoning(reasoning) ? { reasoning: normalizeReasoning(reasoning) } : {}),
        // Provider routing (e.g. {sort:'throughput'} for the synth stream) +
        // optional strict structured outputs — both off unless the caller sets them.
        ...(provider ? { provider } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      console.log(`[llm-stream] model=${model} HTTP ${response.status}: ${errText.slice(0, 200)}`);
      throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`);
    }
    armChunk();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let usage;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armChunk();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return { content, usage };
        try {
          const obj = JSON.parse(payload);
          const delta = obj.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            content += delta;
            onToken(delta, content);
          }
          // include_usage: the final chunk (or occasionally a mid-stream
          // chunk) carries the full usage object. Last one wins.
          if (obj.usage) usage = obj.usage;
        } catch { /* skip non-JSON heartbeats */ }
      }
    }
    return { content, usage };
  } finally {
    clearTimeout(hardTimer);
    if (chunkTimer) clearTimeout(chunkTimer);
  }
}

export async function callLLM(apiKey, model, messages, opts = {}) {
  const { tools, reasoning, maxTokens, provider, responseFormat, models, hardMsOverride, temperature, seed } = opts;
  const body = { messages: sanitizeLLMMessages(messages) };
  // model vs models[] fallback chain are mutually exclusive (OpenRouter 400s on both).
  if (Array.isArray(models) && models.length) body.models = models; else body.model = model;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const rz = normalizeReasoning(reasoning);
  if (rz) body.reasoning = rz;
  if (maxTokens) body.max_tokens = maxTokens;
  if (provider) body.provider = provider;
  if (responseFormat) body.response_format = responseFormat;
  // Deterministic by default — see callLLMStreaming for rationale.
  body.temperature = temperature ?? 0;
  if (seed !== undefined) body.seed = seed;

  // Scale timeout to reasoning effort — medium/high thinking phases alone can run
  // 60-180s. A caller can pass hardMsOverride to cap a fast routing turn tighter.
  const { hardMs: budgetHardMs } = llmBudgetMs(reasoningEffortOf(reasoning));
  const hardMs = hardMsOverride || budgetHardMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardMs);

  console.log(`[llm] calling model=${body.models ? body.models.join('>') : model} effort=${reasoningEffortOf(reasoning) ?? 'none'} tools=${tools?.length ?? 0}`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://chrisputer.tech',
        'X-Title': 'Frank',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log(`[llm] model=${model} HTTP ${response.status}: ${errText.slice(0, 200)}`);
      throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`);
    }

    // Read body as text first (avoids hanging on slow streaming responses)
    const text = await response.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Context management ──────────────────────────────────────────────────────

const MAX_CONTEXT_CHARS = 120_000; // keep context lean for fast LLM responses
const KEEP_HEAD = 2;  // system + first user
const KEEP_TAIL = 10; // most recent turns carry the most signal
const MIDDLE_TOOL_TRUNCATE = 200;

function charCount(messages) {
  let n = 0;
  for (const msg of messages) n += (msg.content ?? '').length;
  return n;
}

// Returns a NEW message array under MAX_CONTEXT_CHARS. Head/tail references are
// reused unchanged; middle messages are either truncated (tool results only) or
// dropped oldest-first until the budget is met. Never mutates input messages —
// the agent loop keeps the authoritative history in the caller's array.
export function pruneMessages(messages) {
  if (charCount(messages) <= MAX_CONTEXT_CHARS) return messages;
  if (messages.length <= KEEP_HEAD + KEEP_TAIL) return messages;

  const head = messages.slice(0, KEEP_HEAD);
  const tail = messages.slice(messages.length - KEEP_TAIL);
  const middleRaw = messages.slice(KEEP_HEAD, messages.length - KEEP_TAIL);

  // Step 1: truncate tool outputs in the middle via copy (don't mutate).
  const middleTruncated = middleRaw.map((msg) => {
    if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
      return { ...msg, content: msg.content.slice(0, MIDDLE_TOOL_TRUNCATE) + '\n[...truncated for context management]' };
    }
    return msg;
  });

  // Step 2: if still over budget, drop oldest middle messages until under.
  let current = [...head, ...middleTruncated, ...tail];
  while (charCount(current) > MAX_CONTEXT_CHARS && middleTruncated.length > 0) {
    middleTruncated.shift();
    current = [...head, ...middleTruncated, ...tail];
  }
  return current;
}
