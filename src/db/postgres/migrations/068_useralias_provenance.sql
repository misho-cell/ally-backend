-- 068: provenance on UserAlias (ticket 6 close A2 / task 27's migration half).
-- The three-phantom-contacts question was unanswerable because rows carry no
-- "which import, when" — every FUTURE row gets both; existing rows stay NULL
-- honestly (backfill is impossible, the metadata was never stored).
ALTER TABLE "UserAlias" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE "UserAlias" ADD COLUMN IF NOT EXISTS source TEXT;
