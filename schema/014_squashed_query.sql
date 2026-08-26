-- TrueRank D1 Schema - migration 014
-- Squashed query column for compound-word research cache matching (e.g. "light bulb" -> "lightbulb").
--
-- squashed_query   tokens in original query order concatenated without spaces,
--                  plus any clarification suffix. Allows compound phrases to hit
--                  the same 14-day research cache as their single-word equivalents.

ALTER TABLE research ADD COLUMN squashed_query TEXT;

CREATE INDEX IF NOT EXISTS idx_research_squashed ON research(squashed_query, status, created_at);

-- Backfill: the SQL backfill derives from the sorted canonical form, so legacy
-- rows only get compound matching where token order happened to be alphabetical
-- - new rows are exact.
UPDATE research SET squashed_query = REPLACE(canonical_query, ' ', '')
 WHERE squashed_query IS NULL AND canonical_query IS NOT NULL;
