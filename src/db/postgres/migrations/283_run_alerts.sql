-- 283: Misho, 29 Oct (after Giorgi's thread 74052, „a delay on our side"): the
-- server watches for runs that got stuck, apologised or failed, and tells the
-- code session in the box, so nobody has to ask a member whether something went
-- wrong. One row per finding, never twice (kind + ref). Ids and counts only: no
-- names, no numbers, no message text.
CREATE TABLE IF NOT EXISTS run_alerts (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL,
  user_id     INTEGER,
  thread_id   INTEGER,
  run_id      TEXT,
  detail      TEXT NOT NULL DEFAULT '',
  test_seat   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at  TIMESTAMPTZ,
  UNIQUE (kind, ref)
);
CREATE INDEX IF NOT EXISTS run_alerts_open_idx ON run_alerts (created_at DESC) WHERE handled_at IS NULL;
