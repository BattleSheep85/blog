// Reachability contract for the research archive, against real D1.
//
// One definition of "a listable report" lives in worker/lib/listable.js. This
// spec proves the three surfaces that used to hold their own copy of it now
// agree: the /research listing, its page count, and the sitemap. The headline
// assertion is the crawl walk. Follow the pagination from page 1 and check the
// reachable slug set equals the listable slug set, difference zero.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { insertProductV2 } from './_helpers.js';
import { renderBrowse } from '../../worker/pages/browse.js';
import { generateSitemap } from '../../worker/lib/sitemap.js';
import { listableCountSql, listableRowsSql } from '../../worker/lib/listable.js';

const ORIGIN = 'https://chrisputer.tech';
const BASE_TS = 1700000000;
const CLUSTERS = 60; // > 1 page at 48/page, so page boundaries are exercised
const TIE_GROUP = 5; // created_at ties straddle the 48-row page boundary

// Winner rule, restated in plain JS so the assertions do not just re-run the
// SQL they are checking: newest created_at wins, id breaks the tie.
function pickWinner(members) {
  return [...members].sort((a, b) =>
    b.created_at - a.created_at || (a.id < b.id ? 1 : -1)
  )[0];
}

const inserted = [];

async function seedRow(db, row) {
  await db.prepare(
    `INSERT INTO research (id, slug, query, status, canonical_query, created_at, completed_at, summary, category)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 'A summary.', 'Test')`
  ).bind(row.id, row.slug, row.query, row.status, row.canonical_query, row.created_at).run();
  for (let p = 0; p < row.products; p++) {
    await insertProductV2(db, { researchId: row.id, name: `${row.slug} product ${p}`, rank: p + 1, rating: 4 });
  }
  inserted.push(row);
  return row;
}

beforeAll(async () => {
  await applySchema(env.DB);

  for (let i = 0; i < CLUSTERS; i++) {
    const created = BASE_TS - Math.floor(i / TIE_GROUP) * 60;
    await seedRow(env.DB, {
      id: `id-${String(i).padStart(3, '0')}-a`,
      slug: `listable-${i}`,
      query: `best listable widget ${i}`,
      status: 'complete',
      canonical_query: `cluster ${i}`,
      created_at: created,
      products: 3,
    });
    // Every fifth cluster gets a second member sharing created_at exactly.
    // Without the id tiebreak the promoted slug flips between executions.
    if (i % 5 === 0) {
      await seedRow(env.DB, {
        id: `id-${String(i).padStart(3, '0')}-b`,
        slug: `listable-${i}-dup`,
        query: `best listable widget ${i} again`,
        status: 'complete',
        canonical_query: `cluster ${i}`,
        created_at: created,
        products: 3,
      });
    }
  }
  // Excluded by the public filter: thin (1 product) and not complete.
  await seedRow(env.DB, {
    id: 'id-thin', slug: 'thin-report', query: 'best thin report widget',
    status: 'complete', canonical_query: 'thin cluster', created_at: BASE_TS, products: 1,
  });
  await seedRow(env.DB, {
    id: 'id-pending', slug: 'pending-report', query: 'best pending report widget',
    status: 'pending', canonical_query: 'pending cluster', created_at: BASE_TS, products: 3,
  });
});

// Expected listable set, computed from the seed data without SQL.
function expectedSlugs() {
  const byCluster = new Map();
  for (const row of inserted) {
    if (row.status !== 'complete' || row.products < 3) continue;
    const list = byCluster.get(row.canonical_query) ?? [];
    byCluster.set(row.canonical_query, [...list, row]);
  }
  return new Set([...byCluster.values()].map((members) => pickWinner(members).slug));
}

function slugsIn(html) {
  const out = new Set();
  const re = /href="\/research\/([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

async function walkPagination() {
  const reachable = new Set();
  let served = 0;
  let page = 1;
  for (; page <= 50; page++) {
    const url = new URL(page === 1 ? `${ORIGIN}/research` : `${ORIGIN}/research?page=${page}`);
    const html = await renderBrowse(url, env);
    if (html === null) break;
    const slugs = slugsIn(html);
    served += slugs.size;
    for (const s of slugs) reachable.add(s);
  }
  return { reachable, served, lastPage: page - 1 };
}

describe('listable report set', () => {
  it('the count query matches the listing query row for row', async () => {
    const countRow = await env.DB.prepare(listableCountSql()).first();
    const rows = await env.DB.prepare(listableRowsSql({ select: 'slug' })).all();
    expect(countRow.n).toBe((rows.results ?? []).length);
    expect(countRow.n).toBe(expectedSlugs().size);
  });

  it('promotes the same cluster winner on every execution', async () => {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const rows = await env.DB.prepare(listableRowsSql({ select: 'slug' })).all();
      runs.push((rows.results ?? []).map((r) => r.slug).join(','));
    }
    expect(new Set(runs).size).toBe(1);
    expect(runs[0].split(',').sort()).toEqual([...expectedSlugs()].sort());
  });
});

describe('/research pagination', () => {
  it('reaches every listable report by following links (difference zero)', async () => {
    const expected = expectedSlugs();
    const { reachable, served } = await walkPagination();
    const missing = [...expected].filter((s) => !reachable.has(s));
    const extra = [...reachable].filter((s) => !expected.has(s));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(reachable.size).toBe(expected.size);
    expect(served).toBe(expected.size); // no slug served on two pages
  });

  it('serves the remainder on the last page and stops there', async () => {
    const { lastPage } = await walkPagination();
    const expected = expectedSlugs().size;
    expect(lastPage).toBe(Math.ceil(expected / 48));
    const last = await renderBrowse(new URL(`${ORIGIN}/research?page=${lastPage}`), env);
    expect(slugsIn(last).size).toBe(expected - (lastPage - 1) * 48);
    expect(last).not.toContain('rel="next"');
  });

  it('404s past the last page instead of an empty 200', async () => {
    const { lastPage } = await walkPagination();
    expect(await renderBrowse(new URL(`${ORIGIN}/research?page=${lastPage + 1}`), env)).toBeNull();
    expect(await renderBrowse(new URL(`${ORIGIN}/research?page=999`), env)).toBeNull();
  });

  it('keeps paginated pages indexable and search results noindex', async () => {
    const paged = await renderBrowse(new URL(`${ORIGIN}/research?page=2`), env);
    expect(paged).not.toContain('noindex, follow');
    expect(paged).toContain(`<link rel="canonical" href="${ORIGIN}/research?page=2">`);
    const search = await renderBrowse(new URL(`${ORIGIN}/research?q=listable`), env);
    expect(search).toContain('noindex, follow');
  });

  it('excludes thin and incomplete reports from the listing', async () => {
    const { reachable } = await walkPagination();
    expect(reachable.has('thin-report')).toBe(false);
    expect(reachable.has('pending-report')).toBe(false);
  });
});

describe('sitemap', () => {
  it('lists exactly the reports the pagination reaches', async () => {
    const res = await generateSitemap(ORIGIN, env, null, '2026-08-03');
    const xml = await res.text();
    const inSitemap = new Set(
      [...xml.matchAll(/<loc>https:\/\/chrisputer\.tech\/research\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1])
    );
    const { reachable } = await walkPagination();
    expect([...inSitemap].filter((s) => !reachable.has(s))).toEqual([]);
    expect([...reachable].filter((s) => !inSitemap.has(s))).toEqual([]);
  });
});
