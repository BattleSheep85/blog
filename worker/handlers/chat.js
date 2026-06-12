/**
 * "Talk about it" chat — POST /api/chat
 *
 * Two modes, one endpoint:
 *  - refine (no slug): help the visitor figure out WHAT to research before
 *    running the pipeline. May return suggested_query when the conversation
 *    converges on a researchable question.
 *  - report (slug): answer follow-up questions grounded in a completed
 *    research report (summary + ranked products + buyer's guide).
 *
 * Cheap by design: google/gemini-2.5-flash, ≤700 output tokens, 20 msgs/hr/IP,
 * and every call's real cost feeds the same monthly budget governor as
 * research runs (503 when the month is spent).
 */

import { checkRateLimit } from '../lib/rate-limit.js';
import { getResearchBySlug, getProductsByResearchId } from '../lib/db.js';
import { parseJsonSafe, displayQuery } from '../lib/utils.js';
import { monthKey, monthlyBudgetUsd, incrementMonthlyCost } from '../pipeline/orchestrator.js';

const CHAT_MODEL = 'google/gemini-2.5-flash';
const CHAT_TIMEOUT_MS = 25_000;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 12_000;

const REFINE_SYSTEM_PROMPT = `You are TrueRank's research concierge. TrueRank reads real reviews (Reddit, forums, independent testers), down-weights affiliate bait and marketing-only sources, and produces one honest ranked comparison for any product, service, place, or thing worth comparing — not just tech. (Accuracy note: TrueRank scores sources by credibility and conflict of interest; it does not claim per-review fake detection. Never tell users we "detect fake reviews.")

Your job: help the visitor figure out what to research. Ask at most ONE short question per turn (budget, use case, constraints). As soon as you have enough to form a specific researchable query, propose it.

Rules:
- Be warm, brief (under 80 words), plain text — no markdown, no lists unless asked.
- Never invent product recommendations yourself; that's the research pipeline's job. You only help shape the question.
- When you have a specific query ready, set suggested_query to it (e.g. "best cordless drill under $150 for home projects"). Otherwise set it to null.
- Decline medical/legal/financial-advice topics politely and steer toward a researchable product angle.

Respond ONLY with JSON: {"reply": string, "suggested_query": string | null}`;

function reportSystemPrompt(entry, products, resultData) {
    const productLines = products.slice(0, 10).map((p) => {
        const bits = [
            `#${p.rank ?? '?'} ${p.name}${p.brand ? ` (${p.brand})` : ''}`,
            p.price != null ? `$${p.price}` : null,
            p.rating != null ? `rating ${p.rating}/5` : null,
            p.best_for ? `best for: ${p.best_for}` : null,
            p.verdict ? `verdict: ${p.verdict}` : null,
            p.pros?.length ? `pros: ${p.pros.slice(0, 4).join('; ')}` : null,
            p.cons?.length ? `cons: ${p.cons.slice(0, 4).join('; ')}` : null,
        ].filter(Boolean);
        return `- ${bits.join(' | ')}`;
    }).join('\n');

    const guide = resultData?.buyersGuide;
    const guideText = guide
        ? [
            guide.howToChoose ? `How to choose: ${guide.howToChoose}` : null,
            guide.pitfalls?.length ? `Pitfalls: ${guide.pitfalls.join('; ')}` : null,
            guide.marketingToIgnore?.length ? `Marketing to ignore: ${guide.marketingToIgnore.join('; ')}` : null,
        ].filter(Boolean).join('\n')
        : '';

    return `You are TrueRank's research assistant, answering follow-up questions about ONE completed research report. Ground every answer in the report below. If the user asks something the report doesn't cover, say so honestly and suggest what a fresh research run could answer — set suggested_query to that new query in that case, otherwise null.

REPORT — "${displayQuery(entry.query)}"
Summary: ${entry.summary || '(none)'}
Ranked items:
${productLines || '(none)'}
${guideText ? `Buyer's guide:\n${guideText}` : ''}

Rules:
- Plain text, under 150 words, no markdown.
- Never fabricate specs, prices, or claims not in the report.
- It's fine to compare items in the report or explain WHY one ranked above another using the pros/cons.
- This report may earn affiliate commission, but rankings are independent — say so if asked.

Respond ONLY with JSON: {"reply": string, "suggested_query": string | null}`;
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}

// Validate and sanitize the client transcript into OpenRouter messages.
function sanitizeMessages(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
    const out = [];
    let total = 0;
    for (const m of raw) {
        if (!m || typeof m !== 'object') return null;
        const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
        const content = typeof m.content === 'string' ? m.content.trim().slice(0, MAX_MESSAGE_CHARS) : '';
        if (!role || !content) return null;
        total += content.length;
        if (total > MAX_TOTAL_CHARS) return null;
        out.push({ role, content });
    }
    if (out[out.length - 1].role !== 'user') return null;
    return out;
}

export async function handleChat(request, env) {
    let body;
    try { body = await request.json(); } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const messages = sanitizeMessages(body?.messages);
    if (!messages) return jsonResponse({ error: 'Invalid messages' }, 400);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rate = await checkRateLimit(env.KV, `chat:${ip}`, 20, 3600);
    if (!rate.allowed) {
        return jsonResponse({ error: 'Chat limit reached for now — try again in a bit.' }, 429);
    }

    // Same monthly governor as research runs.
    const spent = Number(await env.KV.get(`cost:${monthKey()}`)) || 0;
    if (spent >= monthlyBudgetUsd(env)) {
        return jsonResponse({ error: 'Monthly budget exhausted — chat is paused until next month.' }, 503);
    }

    // Build the system prompt for the requested mode.
    let systemPrompt = REFINE_SYSTEM_PROMPT;
    const slug = typeof body?.slug === 'string' ? body.slug.trim().slice(0, 200) : '';
    if (slug) {
        if (!/^[a-z0-9-]+$/.test(slug)) return jsonResponse({ error: 'Invalid slug' }, 400);
        const entry = await getResearchBySlug(env.DB, slug);
        if (!entry || entry.status !== 'complete') {
            return jsonResponse({ error: 'Report not found' }, 404);
        }
        const productRows = await getProductsByResearchId(env.DB, entry.id);
        const products = (productRows.results ?? []).map((p) => ({
            ...p,
            pros: parseJsonSafe(p.pros, []),
            cons: parseJsonSafe(p.cons, []),
        }));
        systemPrompt = reportSystemPrompt(entry, products, parseJsonSafe(entry.result, {}));
    }

    let content = '';
    let cost = 0;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://chrisputer.tech',
                'X-Title': 'TrueRank Chat',
            },
            body: JSON.stringify({
                model: CHAT_MODEL,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                response_format: { type: 'json_object' },
                max_tokens: 700,
                usage: { include: true },
            }),
        }).finally(() => clearTimeout(timer));

        if (!response.ok) {
            console.error('[chat] upstream non-ok:', response.status);
            return jsonResponse({ error: 'The assistant is unavailable right now. Try again shortly.' }, 502);
        }
        const data = await response.json();
        content = data.choices?.[0]?.message?.content ?? '';
        cost = Number(data.usage?.cost) || 0;
    } catch (err) {
        console.error('[chat] request failed:', err instanceof Error ? err.message : String(err));
        return jsonResponse({ error: 'The assistant timed out. Try again.' }, 504);
    }

    await incrementMonthlyCost(env, cost);

    const parsed = parseJsonSafe(content, null);
    const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim().slice(0, 2000) : '';
    const suggested = typeof parsed?.suggested_query === 'string' ? parsed.suggested_query.trim().slice(0, 200) : null;
    if (!reply) {
        // Model returned non-JSON or empty — degrade to raw text if plausible.
        const fallback = String(content || '').trim().slice(0, 2000);
        if (!fallback) return jsonResponse({ error: 'Empty response — try again.' }, 502);
        return jsonResponse({ reply: fallback, suggestedQuery: null });
    }
    return jsonResponse({ reply, suggestedQuery: suggested && suggested.length >= 3 ? suggested : null });
}
