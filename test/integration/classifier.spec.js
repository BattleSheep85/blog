// Integration coverage for worker/lib/classifier.js — KV cache + the OpenRouter
// call (fetch mocked) + validation/fail-open + the rejection-message map.
import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyQuery, userFacingRejection } from '../../worker/lib/classifier.js';

// Build a fake OpenRouter chat-completion response wrapping a classifier JSON.
const orResponse = (classifierJson) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(classifierJson) } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('classifyQuery', () => {
  it('accepts + parses + caches a valid classification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => orResponse({
      accept: true, reject_reason: null, topical_category: 'mechanical keyboards',
      facets: { is_buyable: true, recency_sensitive: true },
      clarifying_questions: [{ key: 'budget', question: 'Budget?', suggested_answers: ['<$75', '$75-150'] }],
    })));
    const r = await classifyQuery(env, 'best mechanical keyboard', 'canon-kbd-1');
    expect(r.accept).toBe(true);
    expect(r.topical_category).toBe('mechanical keyboards');
    expect(r.facets.is_buyable).toBe(true);
    expect(r.clarifying_questions[0].key).toBe('budget');
  });

  it('serves from KV cache on the second call (no second fetch)', async () => {
    const spy = vi.fn(async () => orResponse({ accept: true, facets: { is_buyable: true }, clarifying_questions: [] }));
    vi.stubGlobal('fetch', spy);
    await classifyQuery(env, 'best nas', 'canon-nas-cache');
    await classifyQuery(env, 'best nas', 'canon-nas-cache');
    expect(spy).toHaveBeenCalledTimes(1); // 2nd call hit the cache
  });

  it('fail-opens (accept) on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    const r = await classifyQuery(env, 'x', 'canon-500');
    expect(r.accept).toBe(true);
    expect(r.facets.is_buyable).toBe(true);
  });

  it('fail-opens when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await classifyQuery(env, 'x', 'canon-throw')).accept).toBe(true);
  });

  it('fail-opens on unparseable content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 })));
    expect((await classifyQuery(env, 'x', 'canon-bad')).accept).toBe(true);
  });

  it('honors a rejection classification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => orResponse({ accept: false, reject_reason: 'nonsense', facets: {} })));
    const r = await classifyQuery(env, 'asdf', 'canon-reject');
    expect(r.accept).toBe(false);
    expect(r.reject_reason).toBe('nonsense');
  });

  it('works without a canonical (skips cache)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => orResponse({ accept: true, facets: { is_service: true } })));
    const r = await classifyQuery(env, 'best plumber', null);
    expect(r.accept).toBe(true);
    expect(r.facets.is_service).toBe(true);
  });
});

describe('userFacingRejection', () => {
  for (const cat of ['jailbreak', 'illegal', 'medical', 'legal', 'financial-picks', 'adult', 'self-harm', 'harassment', 'nonsense']) {
    it(`has a message for ${cat}`, () => {
      expect(userFacingRejection(cat).length).toBeGreaterThan(10);
    });
  }
  it('default message for unknown category', () => {
    expect(userFacingRejection('weird')).toContain("can't research");
  });
});
