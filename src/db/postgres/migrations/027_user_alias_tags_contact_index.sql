-- contactId is the owner-user filter used by every search and by the admin
-- analytics/profile queries, but only a trigram index on alias existed. Without
-- a btree on contactId those filters seq-scan the whole (multi-million row)
-- table, which times out COUNT(DISTINCT "contactId") and per-user counts.
CREATE INDEX IF NOT EXISTS idx_user_alias_contact ON "UserAlias" ("contactId");
CREATE INDEX IF NOT EXISTS idx_user_tags_contact  ON "UserTags"  ("contactId");
