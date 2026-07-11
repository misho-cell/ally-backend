-- B6 / GAP3: the assistant must be able to "speak first" when it has news for a
-- goal — but paced, not all at once. A found result is queued here; the backend
-- releases a small burst, then one per day (extras stay held, never invented).
-- release_at encodes the drip schedule; get_pending_updates returns only what is
-- due and flips it to 'seen' so it's reported once.
CREATE TABLE IF NOT EXISTS pending_updates (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  task_id    INTEGER,
  kind       TEXT    NOT NULL,
  payload    JSONB   NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT    NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'seen')),
  release_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_updates_due
  ON pending_updates (user_id, status, release_at);
