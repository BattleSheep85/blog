/**
 * The single definition of "a listable report".
 *
 * A report is listable when it (a) passes publicResearchFilter (complete,
 * not thin, not a test probe) and (b) is the winner of its canonical-query
 * cluster. Before this module the ROW_NUMBER dedupe CTE was copy-pasted into
 * seven places (browse listing, browse count, sitemap, feed, home, category
 * hub, autocomplete) and they had drifted apart:
 *
 *   - none of them broke ties, so SQLite was free to promote a different
 *     cluster member on every execution. The browse listing and the sitemap
 *     could name two different slugs for the same cluster in the same minute,
 *     and rows tied on created_at could be skipped or repeated across a
 *     LIMIT/OFFSET page boundary (a row served on no page at all is an
 *     unreachable report).
 *   - autocomplete partitioned by view_count instead of created_at, so it
 *     promoted a cluster member the listing and sitemap never link.
 *
 * Every caller now builds its SQL here, so the listing, its page count, the
 * sitemap, the feed and every other index agree by construction.
 */

import { publicResearchFilter } from './utils.js';

// Which row wins a canonical cluster. The trailing r.id is the whole point:
// created_at has one-second resolution and clusters do tie on it, so without
// a unique tiebreaker the winner is whatever the query planner felt like.
// r.id is the primary key, so this is a total order.
export const CLUSTER_WINNER_ORDER = 'r.created_at DESC, r.id DESC';

// Order of the deduped result set. Also a total order, which is what makes
// LIMIT/OFFSET paging stable: consecutive pages slice one fixed sequence
// instead of two independently-sorted ones.
export const LISTING_ORDER = 'created_at DESC, id DESC';

// Newest-updated ordering for the Atom feed. Same total-order rule.
export const FEED_ORDER = 'updated DESC, id DESC';

// Columns every listable query must carry so LISTING_ORDER can sort on them.
const REQUIRED_COLUMNS = 'r.id, r.created_at';

/**
 * The `WITH ranked AS (...)` prelude shared by every listable query.
 * @param {string} columns Column list for the CTE (already alias-qualified).
 * @param {string} extraWhere Optional extra predicate, ANDed onto the filter.
 */
export function listableRankedCte(columns, extraWhere = '') {
  const where = extraWhere
    ? `${publicResearchFilter('r')} AND ${extraWhere}`
    : publicResearchFilter('r');
  return `WITH ranked AS (
     SELECT ${columns}, ROW_NUMBER() OVER (
       PARTITION BY COALESCE(r.canonical_query, r.slug)
       ORDER BY ${CLUSTER_WINNER_ORDER}
     ) AS rn
     FROM research r
     WHERE ${where}
   )`;
}

/** How many listable reports exist. Pairs with listableRowsSql by construction. */
export function listableCountSql(extraWhere = '') {
  return `${listableRankedCte(REQUIRED_COLUMNS, extraWhere)}
   SELECT COUNT(*) AS n FROM ranked WHERE rn = 1`;
}

/**
 * A page (or all) of listable reports.
 * @param {object} opts
 * @param {string} [opts.columns] CTE column list. Must include id + created_at.
 * @param {string} [opts.select] Outer select list, evaluated against `ranked`.
 * @param {string} [opts.extraWhere] Extra predicate for the CTE.
 * @param {string} [opts.orderBy] Outer ordering. Must be a total order.
 * @param {string} [opts.tail] Trailing clause, e.g. `LIMIT ?1 OFFSET ?2`.
 */
export function listableRowsSql({
  columns = `r.*`,
  select = '*',
  extraWhere = '',
  orderBy = LISTING_ORDER,
  tail = '',
} = {}) {
  return `${listableRankedCte(columns, extraWhere)}
   SELECT ${select} FROM ranked WHERE rn = 1
   ORDER BY ${orderBy}${tail ? ` ${tail}` : ''}`;
}

/** Product-count subquery used by the card grids. Correlates to the CTE. */
export const PRODUCT_COUNT_SELECT =
  '(SELECT COUNT(*) FROM products WHERE products.research_id = ranked.id) AS product_count';
