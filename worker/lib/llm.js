/**
 * LLM client targeting OpenRouter's free models.
 * OpenAI-compatible API format via fetch(). Zero dependencies.
 *
 * Models:
 *   - DeepSeek R1 (free): Strong reasoning for analysis/fake detection
 *   - Qwen 3.6 Plus (free): Best writing quality for report synthesis
 *   - GPT-OSS 120B (free): Fallback with native tool use
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const MODELS = {
    ANALYSIS: 'deepseek/deepseek-r1:free',
    SYNTHESIS: 'qwen/qwen3.6-plus-preview:free',
    FALLBACK: 'openai/gpt-oss-120b:free',
};

/**
 * Call an LLM via OpenRouter. OpenAI-compatible format.
 * Returns the parsed response body.
 */
export async function callLLM(apiKey, {
    model = MODELS.ANALYSIS,
    messages,
    maxTokens = 4096,
    temperature = 0.3,
    responseFormat,
}) {
    const body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
    };

    if (responseFormat) body.response_format = responseFormat;

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://truerank.app',
            'X-Title': 'TrueRank',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Call LLM with automatic fallback if primary model fails or is rate-limited.
 */
export async function callLLMWithFallback(apiKey, opts) {
    try {
        return await callLLM(apiKey, opts);
    } catch (err) {
        // If rate limited (429) or model unavailable, try fallback
        if (err.message.includes('429') || err.message.includes('503')) {
            console.warn(`Primary model ${opts.model} unavailable, falling back to ${MODELS.FALLBACK}`);
            return callLLM(apiKey, { ...opts, model: MODELS.FALLBACK });
        }
        throw err;
    }
}

/**
 * Extract text content from an OpenRouter/OpenAI-format response.
 */
export function extractText(response) {
    const choice = response.choices?.[0];
    if (!choice) return '';

    // Some models put reasoning in a separate field
    const content = choice.message?.content || '';
    return content;
}

/**
 * Extract structured JSON from an LLM response.
 * Handles raw JSON, code blocks, and thinking-then-JSON patterns.
 */
export function extractJSON(response) {
    const text = extractText(response);
    return parseJSONFromText(text);
}

/**
 * Parse JSON from text that may contain markdown, thinking, or other wrapping.
 */
export function parseJSONFromText(text) {
    // Strip <think>...</think> blocks (DeepSeek R1 reasoning)
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Try raw JSON first
    try {
        return JSON.parse(cleaned);
    } catch {
        // Look for JSON in code blocks
        const jsonMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through
            }
        }

        // Try to find a JSON object anywhere in the text
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch {
                // Fall through
            }
        }

        throw new Error(`Could not extract JSON from response: ${cleaned.slice(0, 300)}`);
    }
}
