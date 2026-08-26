-- Ticket 6, T16's "curiosity_answer_rate" gap: T11's queue was fully
-- live-computed with no record of what was ever shown, so there was nothing
-- to compute a rate against. This is that record — one row per item
-- returned by get_curiosity_queue. New table, starts empty, safe DDL.

CREATE TABLE IF NOT EXISTS curiosity_surfacing_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  question_type TEXT NOT NULL,
  missing_fact TEXT NOT NULL,
  surfaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curiosity_surfacing_log_surfaced_at
  ON curiosity_surfacing_log (surfaced_at);
