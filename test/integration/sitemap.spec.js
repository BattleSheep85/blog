// Integration coverage for worker/lib/sitemap.js — the SEO surfaces (sitemap,
// Atom feed, per-research OG image), against real D1 + KV.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { generateSitemap, generateAtomFeed, generateOgImage } from '../../worker/lib/sitemap.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';
import { completeResearch, insertProductV2 } from './_helpers.js';

const ORIGIN = 'https://chrisputer.tech';

beforeAll(async () => {
  await applySchema(env.DB);
  // A complete research with 3 products clears the thin-page gate (public filter).
  const id = generateId();
  await insertResearch(env.DB, { id, slug: 'best-home-nas', query: 'best home nas', canonicalQuery: 'home-nas' });
  await completeResearch(env.DB, { id, status: 'complete', summary: 'A great NAS roundup.', category: 'NAS', result: '{}', sources: '[]' });
  for (let i = 1; i <= 3; i++) await insertProductV2(env.DB, { researchId: id, name: 'NAS ' + i, rank: i, rating: 4.5 });
});

describe('generateSitemap', () => {
  it('lists the research page + static guides as valid XML', async () => {
    const res = await generateSitemap(ORIGIN, env, null, '2026-06-09');
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toContain(`${ORIGIN}/research/best-home-nas`);
    expect(xml).toContain(`${ORIGIN}/best/synology-vs-qnap/`); // from the guides manifest
  });
  it('answers 304 when If-Modified-Since covers the newest content', async () => {
    const res = await generateSitemap(ORIGIN, env, new Date(Date.now() + 86400_000).toUTCString(), '2026-06-09');
    expect(res.status).toBe(304);
  });
  it('serves the KV-cached XML on a second call', async () => {
    await generateSitemap(ORIGIN, env, null, '2026-06-09'); // populates cache
    const res = await generateSitemap(ORIGIN, env, null, '2026-06-09'); // cache hit
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('/research/best-home-nas');
  });
});

describe('generateAtomFeed', () => {
  it('emits a valid Atom feed with the research entry', async () => {
    const res = await generateAtomFeed(ORIGIN, env, null);
    const xml = await res.text();
    expect(xml).toContain('<feed');
    expect(xml).toContain('best-home-nas');
  });
});

describe('generateOgImage', () => {
  it('renders a per-research SVG', async () => {
    const res = await generateOgImage('best-home-nas', env);
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(await res.text()).toContain('<svg');
  });
  it('falls back to the default OG SVG for an unknown slug', async () => {
    const res = await generateOgImage('no-such-slug', env);
    expect((await res.text())).toContain('<svg');
  });
});
