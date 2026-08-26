// Invariants for worker/lib/listable.js, the single definition of "a listable
// report". These are string-level checks on the generated SQL, which is the
// only place the count query and the listing query can drift apart again.

import {
  listableRankedCte,
  listableCountSql,
  listableRowsSql,
  CLUSTER_WINNER_ORDER,
  LISTING_ORDER,
  FEED_ORDER,
} from '../../worker/lib/listable.js';

// The part of the CTE that decides WHICH rows are listable and WHICH member of
// a cluster wins. Everything from ROW_NUMBER on is identical across callers;
// only the leading column list differs.
function decidingPart(sql) {
  return sql.slice(sql.indexOf('ROW_NUMBER()'), sql.indexOf(') AS rn') + 7)
    + sql.slice(sql.indexOf('WHERE'), sql.indexOf('SELECT', sql.indexOf('WHERE')));
}

export function runListableTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  const countSql = listableCountSql();
  const rowsSql = listableRowsSql();

  // The defect this module exists to prevent: a count that does not describe
  // the rows the listing serves.
  ok('count and listing share the same filter + winner rule',
    decidingPart(countSql) === decidingPart(rowsSql));

  // Determinism. Without a unique tiebreaker SQLite may promote a different
  // cluster member per execution, and LIMIT/OFFSET pages may skip rows.
  ok('cluster winner order ends with the primary key', /r\.id DESC\s*$/.test(CLUSTER_WINNER_ORDER));
  ok('listing order ends with the primary key', /id DESC\s*$/.test(LISTING_ORDER));
  ok('feed order ends with the primary key', /id DESC\s*$/.test(FEED_ORDER));
  ok('count SQL carries the tiebreak', countSql.includes('r.created_at DESC, r.id DESC'));
  ok('rows SQL carries the tiebreak', rowsSql.includes('r.created_at DESC, r.id DESC'));
  ok('rows SQL orders the result set totally', rowsSql.includes('ORDER BY created_at DESC, id DESC'));

  // Both keep the public (thin-page / test-probe) gate.
  ok('count SQL keeps the public filter', countSql.includes("r.status = 'complete'"));
  ok('rows SQL keeps the public filter', rowsSql.includes("r.status = 'complete'"));
  ok('count SQL keeps the thin-page gate', countSql.includes('>= 3'));
  ok('rows SQL keeps the thin-page gate', rowsSql.includes('>= 3'));

  // Cluster partition is the canonical query, falling back to the slug.
  ok('partitions by the canonical query',
    rowsSql.includes('PARTITION BY COALESCE(r.canonical_query, r.slug)'));
  ok('keeps only the cluster winner', rowsSql.includes('WHERE rn = 1'));

  // extraWhere narrows the listable set, it never replaces the gate.
  {
    const narrowed = listableRowsSql({ extraWhere: `r.category IS NOT NULL` });
    ok('extraWhere is ANDed onto the public filter',
      narrowed.includes('AND r.category IS NOT NULL') && narrowed.includes("r.status = 'complete'"));
    const narrowedCount = listableCountSql(`r.category IS NOT NULL`);
    ok('a narrowed count matches its narrowed listing',
      decidingPart(narrowedCount) === decidingPart(narrowed));
  }

  // Optional clauses are appended, not interpolated blindly.
  {
    const paged = listableRowsSql({ tail: 'LIMIT ?1 OFFSET ?2' });
    ok('tail lands after the ORDER BY', paged.trimEnd().endsWith('LIMIT ?1 OFFSET ?2'));
    ok('no tail leaves no trailing clause', !listableRowsSql().includes('LIMIT'));
  }

  // Default column list must satisfy the default ordering.
  {
    const cte = listableRankedCte('r.*');
    ok('default columns cover the ordering', cte.includes('r.*'));
    const feedCols = listableRowsSql({
      columns: 'r.id, r.slug, r.created_at',
      select: 'slug',
      orderBy: FEED_ORDER,
    });
    ok('explicit column lists can carry the ordering columns', feedCols.includes('r.id, r.slug, r.created_at'));
  }

  return report;
}
