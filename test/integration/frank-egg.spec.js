// Coverage for the hidden /frank easter-egg page: it must carry a noindex
// meta tag and stay genuinely absent from the real sitemap XML. See
// worker/pages/frank-egg.js.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { generateSitemap } from '../../worker/lib/sitemap.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';
import { completeResearch, insertProductV2 } from './_helpers.js';
import { renderFrankPage } from '../../worker/pages/frank-egg.js';

const ORIGIN = 'https://chrisputer.tech';

beforeAll(async () => {
  await applySchema(env.DB);
  const id = generateId();
  await insertResearch(env.DB, { id, slug: 'best-home-nas', query: 'best home nas', canonicalQuery: 'home-nas' });
  await completeResearch(env.DB, { id, status: 'complete', summary: 'A great NAS roundup.', category: 'NAS', result: '{}', sources: '[]' });
  for (let i = 1; i <= 3; i++) await insertProductV2(env.DB, { researchId: id, name: 'NAS ' + i, rank: i, rating: 4.5 });
});

describe('renderFrankPage', () => {
  it('carries a noindex, nofollow robots meta tag', () => {
    const html = renderFrankPage();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('contains the expected copy', () => {
    const html = renderFrankPage();
    expect(html).toContain("Frank's Code:");
    expect(html).toContain('Always cite the source.');
    expect(html).toContain('roughly, the way');
  });
});

describe('sitemap does not leak /frank', () => {
  it('excludes /frank from the generated sitemap XML', async () => {
    const res = await generateSitemap(ORIGIN, env, null, '2026-06-09');
    const xml = await res.text();
    expect(xml).not.toContain('/frank');
  });
});
