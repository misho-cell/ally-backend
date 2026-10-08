-- 1690 (A7, D679/D680): a label is a lead, not a fact, and job facts go stale
-- at about 1% a month. A fact can now say it was confirmed by a real result,
-- when the owner last confirmed it, and when the owner was last asked.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS confirmed_by_result_at TIMESTAMPTZ;
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ;
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS confirm_asked_at TIMESTAMPTZ;

-- One row per confirm question shown in a conversation, so a tap is read by the
-- server and „where now?" can wait for its one answer.
CREATE TABLE IF NOT EXISTS fact_confirms (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  thread_id   INTEGER NOT NULL,
  fact_id     BIGINT  NOT NULL,
  phone       TEXT    NOT NULL,
  field_type  TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  value       TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT 'asked'
              CHECK (state IN ('asked', 'yes', 'not_sure', 'no_waiting', 'no_saved', 'dropped')),
  asked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fact_confirms_thread ON fact_confirms (thread_id, asked_at DESC);
