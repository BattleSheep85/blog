// /metrics — pull-based metrics snapshot for the Chrisputer Labs dashboard.
//
// Bearer-token auth via the METRICS_TOKEN env secret:
//   - 503 if METRICS_TOKEN is unset (endpoint not configured)
//   - 401 if the provided Bearer token does not match
//
// Returns a single JSON snapshot (no cursor) covering monthly spend vs budget,
// run stats, top pages, affiliate/guide clicks, subscribers, and the keyword
// flywheel queue. All SQL is parameterized; no user input is interpolated.
//
// Timestamp notes:
//   - research.created_at / completed_at are unix epoch SECONDS (INTEGER).
//   - affiliate_clicks.clicked_at / guide_clicks.clicked_at are TEXT datetimes
//     ('YYYY-MM-DD HH:MM:SS', UTC) written via datetime('now').
//
// Some tables (subscribers, keyword_queue) are owned by a sibling migration
// (schema/005) that may not be applied yet. Their queries are wrapped in
// try/catch and degrade to zero/empty results if the table is missing.

import { monthKey } from '../pipeline/orchestrator.js';

const DAY_SECONDS = 86400;
const THIRTY_DAYS_SECONDS = 30 * DAY_SECONDS;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// `since` is unix seconds; the corresponding TEXT cutoff for clicked_at columns.
function isoSecondsToSqlDatetime(unixSeconds) {
  // 'YYYY-MM-DD HH:MM:SS' in UTC, matching SQLite's datetime('now') format.
  return new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// Group a flat list of {key, c} rows into a {key: count} object.
function countMap(rows, keyField) {
  const out = {};
  for (const row of rows ?? []) {
    const key = row[keyField] ?? 'unknown';
    out[key] = Number(row.c) || 0;
  }
  return out;
}

async function getMonthSpend(env, nowSeconds) {
  const month = monthKey(new Date(nowSeconds * 1000));
  let spent = 0;
  try {
    spent = Number(await env.KV.get(`cost:${month}`)) || 0;
  } catch {
    spent = 0;
  }
  const budget = Number(env.MONTHLY_BUDGET_USD || 60);
  return {
    month,
    spent_usd: spent,
    budget_usd: budget,
    remaining_usd: Math.round((budget - spent) * 1e6) / 1e6,
    pct_used: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
  };
}

async function getRunStats(env, sinceSeconds) {
  const [byStatus, byTier, costAgg, durationAgg] = await Promise.all([
    env.DB.prepare(
      'SELECT status, COUNT(*) AS c FROM research WHERE created_at >= ?1 GROUP BY status',
    ).bind(sinceSeconds).all(),
    env.DB.prepare(
      'SELECT tier, COUNT(*) AS c FROM research WHERE created_at >= ?1 GROUP BY tier',
    ).bind(sinceSeconds).all(),
    env.DB.prepare(
      `SELECT COUNT(cost_usd) AS n, SUM(cost_usd) AS total, AVG(cost_usd) AS avg
         FROM research
        WHERE created_at >= ?1 AND cost_usd IS NOT NULL`,
    ).bind(sinceSeconds).first(),
    env.DB.prepare(
      `SELECT AVG(completed_at - created_at) AS avg_secs
         FROM research
        WHERE created_at >= ?1
          AND completed_at IS NOT NULL
          AND completed_at >= created_at`,
    ).bind(sinceSeconds).first(),
  ]);

  return {
    window_days: 30,
    by_status: countMap(byStatus.results, 'status'),
    by_tier: countMap(byTier.results, 'tier'),
    cost_usd: {
      total: Math.round((Number(costAgg?.total) || 0) * 1e6) / 1e6,
      avg: costAgg?.avg != null ? Math.round(Number(costAgg.avg) * 1e6) / 1e6 : null,
      counted_runs: Number(costAgg?.n) || 0,
    },
    avg_duration_seconds:
      durationAgg?.avg_secs != null ? Math.round(Number(durationAgg.avg_secs) * 10) / 10 : null,
  };
}

async function getTopPages(env) {
  const res = await env.DB.prepare(
    `SELECT r.slug, r.query, r.view_count AS views,
            (SELECT COUNT(*) FROM products p WHERE p.research_id = r.id) AS product_count
       FROM research r
      WHERE r.status = 'complete'
      ORDER BY r.view_count DESC
      LIMIT 20`,
  ).all();
  return (res.results ?? []).map((r) => ({
    slug: r.slug,
    query: r.query,
    views: Number(r.views) || 0,
    product_count: Number(r.product_count) || 0,
  }));
}

async function getAffiliateClicks(env, sinceSqlDatetime) {
  const [totalRow, recentRow, topRows] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM affiliate_clicks').first(),
    env.DB.prepare(
      'SELECT COUNT(*) AS c FROM affiliate_clicks WHERE clicked_at >= ?1',
    ).bind(sinceSqlDatetime).first(),
    // Join products for the product name and research for the owning slug.
    env.DB.prepare(
      `SELECT ac.product_id,
              COUNT(*) AS clicks,
              p.name AS product_name,
              r.slug AS research_slug
         FROM affiliate_clicks ac
         LEFT JOIN products p ON p.id = ac.product_id
         LEFT JOIN research r ON r.id = p.research_id
        GROUP BY ac.product_id
        ORDER BY clicks DESC
        LIMIT 20`,
    ).all(),
  ]);

  return {
    total: Number(totalRow?.c) || 0,
    last_30d: Number(recentRow?.c) || 0,
    top_products: (topRows.results ?? []).map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name ?? null,
      research_slug: r.research_slug ?? null,
      clicks: Number(r.clicks) || 0,
    })),
  };
}

async function getGuideClicks(env) {
  const res = await env.DB.prepare(
    `SELECT guide_slug, COUNT(*) AS c
       FROM guide_clicks
      GROUP BY guide_slug
      ORDER BY c DESC
      LIMIT 20`,
  ).all();
  return countMap(res.results, 'guide_slug');
}

// Subscribers table arrives in schema/005 (sibling agent). Degrade to 0.
async function getSubscriberCount(env) {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM subscribers').first();
    return Number(row?.c) || 0;
  } catch {
    return 0;
  }
}

// keyword_queue arrives in schema/005 (sibling agent). Degrade to empty map.
async function getFlywheel(env) {
  try {
    const res = await env.DB.prepare(
      'SELECT status, COUNT(*) AS c FROM keyword_queue GROUP BY status',
    ).all();
    return countMap(res.results, 'status');
  } catch {
    return {};
  }
}

// Constant-time token compare (SHA-256 digests → fixed-length XOR scan) so the
// metrics Bearer check has no early-out timing side-channel — matches the
// internal-API auth pattern.
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da), vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function handleMetrics(request, env) {
  const token = env.METRICS_TOKEN;
  if (!token) {
    return jsonResponse({ error: 'METRICS_TOKEN not configured' }, 503);
  }

  const auth = request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await timingSafeEqual(provided, token))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const sinceSeconds = nowSeconds - THIRTY_DAYS_SECONDS;
  const sinceSqlDatetime = isoSecondsToSqlDatetime(sinceSeconds);

  const [budget, runs, topPages, affiliate, guideClicks, subscribers, flywheel] =
    await Promise.all([
      getMonthSpend(env, nowSeconds),
      getRunStats(env, sinceSeconds),
      getTopPages(env),
      getAffiliateClicks(env, sinceSqlDatetime),
      getGuideClicks(env),
      getSubscriberCount(env),
      getFlywheel(env),
    ]);

  return jsonResponse(
    {
      server_now: nowSeconds,
      budget,
      runs,
      top_pages: topPages,
      affiliate_clicks: affiliate,
      guide_clicks: guideClicks,
      subscribers,
      flywheel,
    },
    200,
  );
}
