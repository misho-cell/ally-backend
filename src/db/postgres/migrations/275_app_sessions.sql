-- 275 (#7888, founder 26 Oct: 2 sessions x ~15 min a week per person): a
-- session is the app open, counted from the app's own signed-in requests,
-- until 30 minutes pass with none. One row per session.
CREATE TABLE IF NOT EXISTS app_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_seen ON app_sessions (user_id, last_seen_at DESC);
