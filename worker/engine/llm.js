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

export async function callLLMStreaming(
  apiKey,
  model,
  messages,
  onToken,
  reasoningEffort,
) {
  const { hardMs, chunkMs } = llmBudgetMs(reasoningEffort);
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort('hard'), hardMs);
  let chunkTimer = null;
  const armChunk = () => {
    if (chunkTimer) clearTimeout(chunkTimer);
    chunkTimer = setTimeout(() => controller.abort('chunk'), chunkMs);
  };

  console.log(`[llm-stream] calling model=${model} effort=${reasoningEffort ?? 'none'}`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://chrisputer.tech',
        'X-Title': 'Chrisputer Labs',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 8192,
        // OpenRouter emits a final SSE chunk carrying the full usage object
        // (prompt/completion tokens + cost in USD) when this is set. Needed
        // for research.cost_usd accounting.
        stream_options: { include_usage: true },
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
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

export async function callLLM(
  apiKey,
  model,
  messages,
  tools,
  reasoningEffort,
) {
  const body = {
    model,
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  // Scale timeout to reasoning effort — medium/high thinking phases alone can run 60-180s.
  const { hardMs } = llmBudgetMs(reasoningEffort);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardMs);

  console.log(`[llm] calling model=${model} effort=${reasoningEffort ?? 'none'} tools=${tools?.length ?? 0}`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://chrisputer.tech',
        'X-Title': 'Chrisputer Labs',
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
