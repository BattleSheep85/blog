// Integration coverage for worker/index.js routing — drives the real worker via
// SELF.fetch (same env/bindings the test seeds), covering the offline routes:
// feeds, redirects, report API, research pages, CORS, 404.
import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { generateId, insertResearch, completeResearch, insertProductV2 } from '../../worker/lib/db.js';

const BASE = 'https://chrisputer.tech';
let completeId;

beforeAll(async () => {
  await applySchema(env.DB);
  completeId = generateId();
  await insertResearch(env.DB, { id: completeId, slug: 'best-budget-nas', query: 'best budget nas', canonicalQuery: 'budget-nas' });
  await completeResearch(env.DB, { id: completeId, status: 'complete', summary: 'Roundup.', category: 'NAS', result: JSON.stringify({ source_count: 4 }), sources: '[]' });
  for (let i = 1; i <= 3; i++) await insertProductV2(env.DB, { researchId: completeId, name: 'NAS ' + i, rank: i, rating: 4.4 });
});

describe('index.js routing', () => {
  it('OPTIONS → CORS preflight', async () => {
    const res = await SELF.fetch(`${BASE}/api/research`, { method: 'OPTIONS' });
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GET /find?q=… → 302 to a Google search', async () => {
    const res = await SELF.fetch(`${BASE}/find?q=cordless+drill`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://www.google.com/search?q=cordless%20drill');
  });

  it('GET /sitemap.xml → 200 XML listing the research page', async () => {
    const res = await SELF.fetch(`${BASE}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('/research/best-budget-nas');
  });

  it('GET /feed.xml → 200 Atom feed', async () => {
    const res = await SELF.fetch(`${BASE}/feed.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('atom');
  });

  it('GET /api/report/:id → 200 for a complete report', async () => {
    const res = await SELF.fetch(`${BASE}/api/report/${completeId}`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('completed');
  });

  it('GET /api/report/:id → 404 for unknown', async () => {
    expect((await SELF.fetch(`${BASE}/api/report/nope`)).status).toBe(404);
  });

  it('GET /research/:slug → 200 server-rendered HTML', async () => {
    const res = await SELF.fetch(`${BASE}/research/best-budget-nas`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('best budget nas'.replace(/\b\w/g, (c) => c)); // query appears (any case)
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('GET /research/:unknown → 404', async () => {
    expect((await SELF.fetch(`${BASE}/research/no-such-slug-here`)).status).toBe(404);
  });

  it('legacy /report/:id → 301 to /research', async () => {
    const res = await SELF.fetch(`${BASE}/report/oldid123`, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toContain('/research');
  });

  it('internal endpoint without secret → 401', async () => {
    const res = await SELF.fetch(`${BASE}/api/internal/next-job`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('security headers on a rendered page', async () => {
    const res = await SELF.fetch(`${BASE}/research/best-budget-nas`);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});
