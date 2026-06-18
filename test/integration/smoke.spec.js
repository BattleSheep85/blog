// Harness smoke test: proves the Workers test pool gives us real, isolated
// D1 + KV bindings (in-memory Miniflare, not production).
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Workers test harness', () => {
  it('exposes D1 + KV bindings', () => {
    expect(env.DB).toBeDefined();
    expect(env.KV).toBeDefined();
  });

  it('KV round-trips', async () => {
    await env.KV.put('smoke:k', 'v1');
    expect(await env.KV.get('smoke:k')).toBe('v1');
  });

  it('D1 executes a query', async () => {
    const row = await env.DB.prepare('SELECT 1 + 1 AS n').first();
    expect(row.n).toBe(2);
  });
});
