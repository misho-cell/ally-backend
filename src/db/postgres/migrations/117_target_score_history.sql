-- 117: the weekly target list keeps a record of what it said (tasks 1–10).
--
-- Every rebuild erased the last one. The list was a photograph nobody kept:
-- there was no way to ask why somebody was ranked third last month and
-- fourteenth this month, and no way at all to ask the question the founder's
-- own spec ends on — "if a signal never pays off, its weight should fall".
-- Learning from outcomes needs a before to compare the after against, and
-- there was none.
--
-- One row per listed candidate per build. Only the rows that were actually
-- LISTED are kept: those are the ones anybody could act on, and keeping every
-- survivor would store hundreds of rows an hour to answer a question nobody
-- asks about people nobody saw.
--
-- The parts are stored whole, as JSON, on purpose. They are the explanation —
-- fit and its evidence, reach, pull, the bubble — and freezing them in columns
-- would mean a migration every time the score learns a new input. A history
-- that cannot record tomorrow's reasons is not a history.
CREATE TABLE IF NOT EXISTS target_score_history (
  id         BIGSERIAL   PRIMARY KEY,
  -- One timestamp shared by every row of the same build, so a build can be
  -- read back as the list it was rather than as loose rows.
  built_at   TIMESTAMPTZ NOT NULL,
  phone      TEXT        NOT NULL,
  -- The name the crowd had for them AT THE TIME. Labels change; the reason a
  -- past decision looked right must not change with them.
  label      TEXT        NOT NULL,
  score      NUMERIC(6,4) NOT NULL,
  -- 1-based position in that build's list.
  rank       INTEGER     NOT NULL,
  -- How long the list was allowed to be — a rank of 20 means something
  -- different when the capacity was 22 than when it was 200.
  capacity   INTEGER     NOT NULL,
  parts      JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "How has this person's score moved?" — the question the table exists for.
CREATE INDEX IF NOT EXISTS idx_target_score_history_phone
  ON target_score_history (phone, built_at DESC);

-- "What did the list say on that day?"
CREATE INDEX IF NOT EXISTS idx_target_score_history_built
  ON target_score_history (built_at DESC);

-- A build is written once. A retry after a partial failure, or two workers
-- racing the same rebuild, must not double the history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_target_score_history_unique
  ON target_score_history (built_at, phone);
