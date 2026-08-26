// Integration coverage for worker/handlers/affiliate.js — the conversion path:
// click logging + the affiliate-redirect decision tree, against real D1.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleAffiliateClick, handleAffiliateSearch } from '../../worker/handlers/affiliate.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';

// db.js has no shared products-insert helper — the pipeline (orchestrator.js)
// writes products inline via raw SQL, so tests do the same against the v2
// schema (schema/003_research_v2.sql).
async function insertProductV2(db, { id, researchId, name, brand = null, rank = null, affiliateUrl = null, productUrl = null }) {
  await db.prepare(
    `INSERT INTO products (id, research_id, name, brand, rank, affiliate_url, product_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(id, researchId, name, brand, rank, affiliateUrl, productUrl).run();
}

// Default to a real-browser UA + a distinct IP per call (rate-limit-safe) so the
// existing happy-path tests exercise the "real visitor" branch. Bot-detection
// tests below override headers explicitly.
let ipCounter = 0;
const req = (path, headers = {}) => new Request('https://chrisputer.tech' + path, {
  headers: {
    'CF-Connecting-IP': `9.9.9.${++ipCounter}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    ...headers,
  },
});

let rid;
beforeAll(async () => {
  await applySchema(env.DB);
  // These cases exercise the redirect decision tree, not volume defense, and
  // together they fire far more clicks a minute than the real site ever sees.
  // Pin the SITE-WIDE gate open so it cannot flag them. The gate itself is
  // covered in test/integration/affiliate-global-gate.spec.js.
  env.RL_AFFILIATE_GLOBAL = { async limit() { return { success: true }; } };
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

  it('last resort: a KNOWN-RETAILER product_url is used when name too short for a search fallback', async () => {
    const pid = generateId();
    // name length < 3 → buildAmazonSearchFallback returns '' → known-retailer product_url is used.
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'AB', rank: 4, productUrl: 'https://www.bestbuy.com/site/widget/12345.p' });
    const loc = (await handleAffiliateClick(pid, req(`/api/go/${pid}`), env)).headers.get('Location');
    expect(loc).toBe('https://www.bestbuy.com/site/widget/12345.p');
  });

  it('does NOT open-redirect to a non-retailer product_url (falls back to tagged Amazon)', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'AB', rank: 5, productUrl: 'https://example.com/widget' });
    const loc = (await handleAffiliateClick(pid, req(`/api/go/${pid}`), env)).headers.get('Location');
    expect(loc).not.toContain('example.com');
    expect(loc).toContain('amazon.com');
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

describe('bot/scraper defense (2026-07-01: /api/ is disallowed in robots.txt, but non-compliant scrapers hit it anyway and polluted click data)', () => {
  it('handleAffiliateClick: bot UA gets no tag and is not logged', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'Bot NAS', rank: 5, affiliateUrl: 'https://www.amazon.com/dp/B0BOTBOT01?tag=battlesheep0a-20' });
    const res = await handleAffiliateClick(pid, req(`/api/go/${pid}`, { 'User-Agent': 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)' }), env);
    const loc = res.headers.get('Location');
    expect(loc).toContain('/dp/B0BOTBOT01');
    expect(loc).not.toContain('tag=');
    expect(loc).not.toContain('ascsubtag=');
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM affiliate_clicks WHERE product_id = ?').bind(pid).first();
    expect(n.n).toBe(0);
  });

  it('handleAffiliateClick: missing User-Agent is treated as suspicious', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'No-UA NAS', rank: 6, affiliateUrl: 'https://www.amazon.com/dp/B0NOUA0001?tag=battlesheep0a-20' });
    const res = await handleAffiliateClick(pid, req(`/api/go/${pid}`, { 'User-Agent': '' }), env);
    expect(res.headers.get('Location')).not.toContain('tag=');
  });

  it('handleAffiliateClick: same IP exceeding the hourly cap gets flagged even with a real UA', async () => {
    const pid = generateId();
    await insertProductV2(env.DB, { id: pid, researchId: rid, name: 'Rate NAS', rank: 7, affiliateUrl: 'https://www.amazon.com/dp/B0RATE0001?tag=battlesheep0a-20' });
    const sameIpReq = () => new Request(`https://chrisputer.tech/api/go/${pid}`, {
      headers: { 'CF-Connecting-IP': '5.5.5.5', 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605' },
    });
    let lastLoc;
    for (let i = 0; i < 32; i++) {
      lastLoc = (await handleAffiliateClick(pid, sameIpReq(), env)).headers.get('Location');
    }
    // 31st+ request from the same IP within the window exceeds the 30/hr cap.
    expect(lastLoc).not.toContain('tag=');
  });

  it('handleAffiliateSearch: bot UA gets no tag and no guide-click log', async () => {
    const res = await handleAffiliateSearch(req('/api/go/search?q=drill&ref=bot-guide', { 'User-Agent': 'python-requests/2.31.0' }), env);
    const loc = res.headers.get('Location');
    expect(loc).toContain('amazon.com/s?k=drill');
    expect(loc).not.toContain('tag=');
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM guide_clicks WHERE guide_slug = 'bot-guide'").first();
    expect(n.n).toBe(0);
  });
});
