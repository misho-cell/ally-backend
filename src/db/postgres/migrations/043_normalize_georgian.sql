-- Georgian-script searchability at scale. This database's locale classifies
-- Georgian letters as non-word chars, so pg_trgm extracts almost no trigrams
-- from KA text (show_trgm('შენგელია') → 1 gram) — no trigram index can serve a
-- KA pattern. Fix at the root: normalize_search_token now transliterates
-- Georgian to single Latin letters FIRST (char-for-char, consistent on both
-- the indexed value and the query term), then applies the existing digraph
-- folds. Normalized text is pure ASCII → trigram indexes work for every script.
CREATE OR REPLACE FUNCTION normalize_search_token(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(replace(replace(replace(replace(replace(
    translate(lower(coalesce(input, '')),
      'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
      'abgdevztiklmnopjrstufkgkscczcckjh'),
    'gh', 'g'), 'kh', 'k'), 'zh', 'j'), 'ts', 'c'), 'x', 'k'), 'q', 'k');
$$;

-- ⚠ REQUIRED MANUAL STEPS after this deploys (CONCURRENTLY is illegal inside
-- the migration transaction). The old index contents were built with the old
-- function and are stale until reindexed:
--
--   REINDEX INDEX CONCURRENTLY idx_user_tags_norm_trgm;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_alias_norm_trgm
--     ON "UserAlias" USING GIN (normalize_search_token(alias) gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_name_norm_trgm
--     ON "User" USING GIN (normalize_search_token(name) gin_trgm_ops);
