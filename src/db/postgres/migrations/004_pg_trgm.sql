-- Enable trigram extension for fuzzy name/tag matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fast similarity queries
CREATE INDEX IF NOT EXISTS idx_user_alias_trgm ON "UserAlias" USING GIN (LOWER(alias) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_name_trgm  ON "User"      USING GIN (LOWER(name)  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_tags_trgm  ON "UserTags"  USING GIN (LOWER(tag)   gin_trgm_ops);
