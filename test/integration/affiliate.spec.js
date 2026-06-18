// Integration coverage for worker/handlers/affiliate.js — the conversion path:
// click logging + the affiliate-redirect decision tree, against real D1.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleAffiliateClick, handleAffiliateSearch } from '../../worker/handlers/affiliate.js';
import { generateId, insertResearch, insertProductV2 } from '../../worker/lib/db.js';

const req = (path) => new Request('https://chrisputer.tech' + path, { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

let rid;
beforeAll(async () => {
  await applySchema(env.DB);
  rid = generateId();
  await insertResearch(env.DB, { id: rid, slug: 'best-nas-z', query: 'best nas', canonicalQuery: 'nas' });
});

describe('handleAffiliateClick', () => {
  it('uses a real tagged Amazon /dp link directly + adds ascsubtag', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'NAS', rank: 1, affiliateUrl: 'https://www.amazon.com/dp/B0ABCDEFGH?tag=battlesheep0a-20' });
    const res = await handleAffiliateClick(pid, req(`/api/go/${pid}?ref=best-nas-z&network=amazon`), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get('Location');
    expect(loc).toContain('/dp/B0ABCDEFGH');
    expect(loc).toContain('ascsubtag=tr-best-nas-z');
    // click was logged
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM affiliate_clicks WHERE product_id = ?').bind(pid).first();
    expect(n.n).toBe(1);
  });

  it('honors a non-Amazon retailer affiliate link', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'Item', rank: 2, affiliateUrl: 'https://goto.walmart.com/c/W1/s/1?u=x' });
    const loc = (await handleAffiliateClick(pid, req(`/api/go/${pid}`), env)).headers.get('Location');
    expect(loc).toContain('walmart.com');
  });

  it('rebuilds a tagged Amazon search when no usable affiliate link exists', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'Synology DS224', brand: 'Synology', rank: 3 });
    const loc = (await handleAffiliateClick(pid, req(`/api/go/${pid}`), env)).headers.get('Location');
    expect(loc).toContain('amazon.com/s?k=');
    expect(loc).toContain('tag=battlesheep0a-20');
  });

  it('last resort: untagged product_url when name too short for a search fallback', async () => {
    const pid = generateId();
    // name length < 3 → buildAmazonSearchFallback returns '' → product_url is used.
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'AB', rank: 4, productUrl: 'https://example.com/widget' });
    const loc = (await handleAffiliateClick(pid, req(`/api/go/${pid}`), env)).headers.get('Location');
    expect(loc).toBe('https://example.com/widget');
  });

  it('falls back to the tagged Amazon homepage for an unknown product', async () => {
    const loc = (await handleAffiliateClick('does-not-exist', req('/api/go/x'), env)).headers.get('Location');
    expect(loc).toContain('amazon.com');
    expect(loc).toContain('tag=battlesheep0a-20');
  });
});

describe('handleAffiliateSearch', () => {
  it('builds a tagged Amazon search and logs a guide click', async () => {
    const res = await handleAffiliateSearch(req('/api/go/search?q=cordless+drill&ref=best-drills'), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get('Location');
    expect(loc).toContain('amazon.com/s?k=cordless');
    expect(loc).toContain('ascsubtag=tr-guide-best-drills');
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM guide_clicks WHERE guide_slug = 'best-drills'").first();
    expect(n.n).toBe(1);
  });

  it('empty query → tagged homepage', async () => {
    const loc = (await handleAffiliateSearch(req('/api/go/search'), env)).headers.get('Location');
    expect(loc).toContain('amazon.com');
    expect(loc).toContain('tag=battlesheep0a-20');
  });
});
