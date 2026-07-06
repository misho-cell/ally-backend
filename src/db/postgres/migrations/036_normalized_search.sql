-- Collapse deterministic Georgian->Latin spelling drift to one canonical token
-- so variant spellings of a tag can be matched. Digraphs merge exactly
-- (gh->g, kh->k, zh->j, ts->c) and q/x fold into k. The r<->g drift (from ღ)
-- and outright typos cannot be collapsed by letter rules without over-merging
-- genuine r/g letters, so those are caught by trigram similarity computed over
-- this normalized form (search code unions a fuzzy pass on it).
--
-- IMMUTABLE + PARALLEL SAFE so it can back a functional expression index.
CREATE OR REPLACE FUNCTION normalize_search_token(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(replace(replace(replace(replace(replace(
    lower(coalesce(input, '')),
    'gh', 'g'), 'kh', 'k'), 'zh', 'j'), 'ts', 'c'), 'x', 'k'), 'q', 'k');
$$;

-- The trigram GIN index that makes the normalized fuzzy pass fast is created
-- OUT OF BAND with CREATE INDEX CONCURRENTLY (this migration runs inside one
-- transaction, where CONCURRENTLY is illegal, and a plain CREATE INDEX would
-- lock "UserTags" writes across millions of rows during the deploy). Run once,
-- manually, off-peak:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tags_norm_trgm
--     ON "UserTags" USING GIN (normalize_search_token(tag) gin_trgm_ops);
--
-- Until it exists the fuzzy pass simply times out and is skipped (the exact
-- search is unaffected), so deploying this migration is safe on its own.
