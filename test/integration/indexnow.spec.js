// Coverage for worker/lib/indexnow.js — the fire-and-forget IndexNow ping
// (fetch mocked). It must never throw and must no-op when unconfigured.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { submitToIndexNow } from '../../worker/lib/indexnow.js';

afterEach(() => vi.unstubAllGlobals());

describe('submitToIndexNow', () => {
  it('no-op without a key (fetch never called)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await submitToIndexNow({}, ['https://chrisputer.tech/research/x']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('no-op on empty urls', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await submitToIndexNow({ INDEXNOW_KEY: 'k' }, []);
    expect(spy).not.toHaveBeenCalled();
  });

  it('POSTs the key + urlList on success', async () => {
    const spy = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await submitToIndexNow({ INDEXNOW_KEY: 'mykey' }, ['https://chrisputer.tech/research/x']);
    expect(spy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.key).toBe('mykey');
    expect(body.urlList).toContain('https://chrisputer.tech/research/x');
  });

  it('swallows a non-OK response (no throw)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(submitToIndexNow({ INDEXNOW_KEY: 'k' }, ['https://x/a'])).resolves.toBeUndefined();
  });

  it('swallows a fetch error (no throw)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    await expect(submitToIndexNow({ INDEXNOW_KEY: 'k' }, ['https://x/a'])).resolves.toBeUndefined();
  });
});
