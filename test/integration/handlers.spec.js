// Integration coverage for the user-facing handlers: subscribe (DB), image proxy
// (DB + fetch mocked), and the auth flow (signup/login/logout — DB + crypto).
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect, vi, afterEach } from 'vitest';
import { applySchema } from './_schema.js';
import { handleSubscribe } from '../../worker/handlers/subscribe.js';
import { handleProductImage } from '../../worker/handlers/image.js';
import { handleSignup, handleLogin, handleLogout } from '../../worker/handlers/auth.js';
import { generateId, insertResearch, insertProductV2 } from '../../worker/lib/db.js';

beforeAll(() => applySchema(env.DB));
afterEach(() => vi.unstubAllGlobals());

const postJson = (body) => new Request('https://x/p', {
  method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' },
});

describe('handleSubscribe', () => {
  it('405 on non-POST', async () => {
    const get = new Request('https://x/p', { method: 'GET', headers: { 'CF-Connecting-IP': '9.9.9.9' } });
    expect((await handleSubscribe(get, env)).status).toBe(405);
  });
  it('400 on invalid JSON', async () => {
    const r = new Request('https://x/p', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } });
    expect((await handleSubscribe(r, env)).status).toBe(400);
  });
  it('400 on invalid email', async () => {
    expect((await handleSubscribe(postJson({ email: 'not-an-email' }), env)).status).toBe(400);
  });
  it('200 + persists a valid subscription (idempotent)', async () => {
    expect((await (await handleSubscribe(postJson({ email: 'Fan@Example.com', researchId: 'r1' }), env)).json()).ok).toBe(true);
    await handleSubscribe(postJson({ email: 'fan@example.com', researchId: 'r1' }), env); // dup → INSERT OR IGNORE
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE email = 'fan@example.com'").first();
    expect(n.n).toBe(1);
  });
});

describe('handleProductImage', () => {
  let pid;
  beforeAll(async () => {
    const rid = generateId();
    await insertResearch(env.DB, { id: rid, slug: 's-' + rid, query: 'q', canonicalQuery: 'imgq' });
    pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'P', rank: 1, imageUrl: 'https://cdn.example/photo.jpg' });
  });

  it('404 for unknown product', async () => {
    expect((await handleProductImage('nope', env)).status).toBe(404);
  });
  it('proxies a valid upstream image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('JPEGBYTES'.repeat(200), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '1800' } })));
    const res = await handleProductImage(pid, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });
  it('404 when upstream is not an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
    expect((await handleProductImage(pid, env)).status).toBe(404);
  });
  it('404 when the upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await handleProductImage(pid, env)).status).toBe(404);
  });
});

// NB: vitest-pool-workers isolates D1/KV PER TEST, so each `it` must be
// self-contained (it can't see a user another `it` created).
describe('auth flow', () => {
  const email = 'user@truerank.test';
  const PW = 'hunter2pass';

  it('signup creates an account + session cookie, then rejects the duplicate (409)', async () => {
    const res = await handleSignup(postJson({ email, password: PW }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeTruthy();
    expect((await handleSignup(postJson({ email, password: PW }), env)).status).toBe(409);
  });

  it('signup validates email + password', async () => {
    expect((await handleSignup(postJson({ email: 'bad', password: PW }), env)).status).toBe(400);
    expect((await handleSignup(postJson({ email: 'x@y.com', password: 'short' }), env)).status).toBe(400);
  });

  it('login succeeds with the right password, fails otherwise', async () => {
    await handleSignup(postJson({ email, password: PW }), env); // self-contained: create first
    expect((await handleLogin(postJson({ email, password: PW }), env)).status).toBe(200);
    expect((await handleLogin(postJson({ email, password: 'wrongpass1' }), env)).status).toBe(401);
    expect((await handleLogin(postJson({ email: 'nobody@x.com', password: 'whatever1' }), env)).status).toBe(401);
  });

  it('logout returns ok + clears the cookie', async () => {
    const res = await handleLogout(postJson({}), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('=');
  });
});
