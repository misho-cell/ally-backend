-- Search/lookup activity log, used to detect stalking and abuse patterns
-- (excessive volume, repeatedly targeting the same person).
CREATE TABLE IF NOT EXISTS search_activity (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  query      TEXT NOT NULL,
  flagged    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_activity_user_time
  ON search_activity (user_id, created_at DESC);
