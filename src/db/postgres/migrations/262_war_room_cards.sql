-- 262: #7591 WAR ROOM (founder, 24 Oct 02:01 Tbilisi): one card per person and request the team
-- should act on. Netai builds the cards itself; the founder leaves an instruction on each; later a
-- worker drafts and he approves (#7360 sends). One row per (kind, subject): a rebuild never makes a
-- second card for the same thing, and never overwrites the status or the instruction already on it.
CREATE TABLE IF NOT EXISTS war_room_cards (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  subject_key     TEXT NOT NULL,
  thread_id       INTEGER,
  task_id         INTEGER,
  brief           JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','instructed','drafted','approved','sent','held','dropped')),
  instruction     TEXT,
  instruction_by  TEXT,
  instruction_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, subject_key)
);

CREATE INDEX IF NOT EXISTS idx_war_room_cards_status ON war_room_cards (status, created_at DESC);
