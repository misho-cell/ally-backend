-- #4293 (tester 50625; Misho's yes 29 Oct): the setup scripts build an empty
-- database from nothing. Checked 29 Oct on a fresh Postgres 16: all migrations
-- run and the server starts. Only the three normalized trigram indexes were
-- missing, because migrations 036 and 043 leave them to a manual
-- CREATE INDEX CONCURRENTLY (a plain CREATE INDEX would lock millions of live
-- rows during a deploy). A table this small has nothing to lock, so here they
-- are built in place. The live tables are far larger and are left to the
-- out-of-band steps, exactly as before.
DO $$
DECLARE
  small_table CONSTANT int := 10000;
BEGIN
  IF (SELECT count(*) FROM (SELECT 1 FROM "UserTags" LIMIT small_table + 1) t) <= small_table THEN
    CREATE INDEX IF NOT EXISTS idx_user_tags_norm_trgm
      ON "UserTags" USING GIN (normalize_search_token(tag) gin_trgm_ops);
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM "UserAlias" LIMIT small_table + 1) t) <= small_table THEN
    CREATE INDEX IF NOT EXISTS idx_user_alias_norm_trgm
      ON "UserAlias" USING GIN (normalize_search_token(alias) gin_trgm_ops);
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM "User" LIMIT small_table + 1) t) <= small_table THEN
    CREATE INDEX IF NOT EXISTS idx_user_name_norm_trgm
      ON "User" USING GIN (normalize_search_token(name) gin_trgm_ops);
  END IF;
END $$;
