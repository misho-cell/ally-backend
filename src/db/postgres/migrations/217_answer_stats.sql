-- 1689 (A6, D679/D680): how each person answers, by field — kept as separate
-- counters, never one merged score: „knows" (yes, helped) and „answers"
-- (asked, yes + no + referred, speed) stay apart so the chatty never outrank
-- the competent. Written by the server from the source tables; never shown to
-- any user, never exported; read only on the admin per-user page.
CREATE TABLE IF NOT EXISTS answer_stats (
  user_id                      INTEGER NOT NULL,
  field                        TEXT    NOT NULL DEFAULT '',
  asked                        INTEGER NOT NULL DEFAULT 0,
  yes                          INTEGER NOT NULL DEFAULT 0,
  no                           INTEGER NOT NULL DEFAULT 0,
  referred                     INTEGER NOT NULL DEFAULT 0,
  later                        INTEGER NOT NULL DEFAULT 0,
  silent                       INTEGER NOT NULL DEFAULT 0,
  first_answer_minutes_median  REAL,
  helped                       INTEGER NOT NULL DEFAULT 0,
  bridged                      INTEGER NOT NULL DEFAULT 0,
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, field)
);
