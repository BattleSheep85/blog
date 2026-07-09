// Integration coverage for the user-facing handlers: subscribe (DB), image proxy
// (DB + fetch mocked), and the auth flow (signup/login/logout — DB + crypto).
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect, vi, afterEach } from 'vitest';
import { applySchema } from './_schema.js';
import { handleSubscribe } from '../../worker/handlers/subscribe.js';
import { handleUnsubscribe } from '../../worker/handlers/unsubscribe.js';
import { handleProductImage } from '../../worker/handlers/image.js';
import { handleSignup, handleLogin, handleLogout } from '../../worker/handlers/auth.js';
import { createUser, findUserByEmail } from '../../worker/lib/auth.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';

// db.js has no shared products-insert helper (the pipeline writes products inline
// via raw SQL; the dead insertProductV2/completeResearch helpers were removed
// 2026-06-25). Tests do the same against the v2 schema (schema/003_research_v2.sql).
async function insertProductV2(db, { id, researchId, name, rank = null, imageUrl = null }) {
  await db.prepare(
    'INSERT INTO products (id, research_id, name, rank, image_url) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(id, researchId, name, rank, imageUrl).run();
}

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
  it('stores an unsub_token + created_at (consent timestamp) on new rows', async () => {
    await handleSubscribe(postJson({ email: 'consent@example.com' }), env);
    const row = await env.DB.prepare("SELECT unsub_token, created_at, unsubscribed_at FROM subscribers WHERE email='consent@example.com'").first();
    expect(row.unsub_token).toBeTruthy();
    expect(row.created_at).toBeGreaterThan(0);
    expect(row.unsubscribed_at).toBe(null);
  });
});

describe('handleUnsubscribe', () => {
  it('a valid token unsubscribes every row for that email; bad/missing token 404/400', async () => {
    await handleSubscribe(postJson({ email: 'bye@example.com', researchId: 'rA' }), env);
    await handleSubscribe(postJson({ email: 'bye@example.com', researchId: 'rB' }), env);
    const row = await env.DB.prepare("SELECT unsub_token FROM subscribers WHERE email='bye@example.com' LIMIT 1").first();
    expect(row.unsub_token).toBeTruthy();

    const res = await handleUnsubscribe(new Request(`https://x/unsubscribe?token=${row.unsub_token}`, { method: 'GET' }), env);
    expect(res.status).toBe(200);
    const active = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE email='bye@example.com' AND unsubscribed_at IS NULL").first();
    expect(active.n).toBe(0);

    expect((await handleUnsubscribe(new Request('https://x/unsubscribe?token=nope', { method: 'GET' }), env)).status).toBe(404);
    expect((await handleUnsubscribe(new Request('https://x/unsubscribe', { method: 'GET' }), env)).status).toBe(400);
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

  it('signup is under construction (503) and creates no user', async () => {
    const res = await handleSignup(postJson({ email, password: PW }), env);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/under construction/i);
    expect(await findUserByEmail(env.DB, email)).toBeFalsy();
  });

  it('login succeeds with the right password, fails otherwise', async () => {
    await createUser(env.DB, email, PW); // signup disabled → create the user directly
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
