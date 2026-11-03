-- 290: Misho, 3 Nov (prompt debugging, „სრული სურათი მინდა დავინახო"): what the
-- run trace could not show from the tables it already had.
--
-- run_prompt_texts: the exact system prompt a run sent, gzip-compressed and kept
-- once per distinct text (a sha256 of the text is the key). Written for test
-- seats only; run_prompt_stamps.prompt_hashes lists the texts each run sent, in
-- order (a run's prompt can change between its model rounds).
--
-- run_trace_events: the server's own steps inside a run that left no row
-- anywhere else — each model call (model, stop reason, time, tokens), a reply
-- the server dropped and why, a reply it rewrote (before and after). Pruned
-- with the stamps, after 30 days.
CREATE TABLE IF NOT EXISTS run_prompt_texts (
  hash        TEXT PRIMARY KEY,
  text_gzip   BYTEA NOT NULL,
  chars       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE run_prompt_stamps ADD COLUMN IF NOT EXISTS prompt_hashes TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS run_trace_events (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS run_trace_events_run_idx ON run_trace_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS run_trace_events_age_idx ON run_trace_events (created_at);
