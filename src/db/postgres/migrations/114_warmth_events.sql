-- 114: warmth that GROWS (ticket 9 task 13.1, the founder's correction of
-- 1 September).
--
-- Chorus may only ask a user to invite someone they are genuinely close to —
-- asking about a near-stranger does not merely fail, it spends the one scarce
-- thing we have, their willingness to be asked. But the only warmth the system
-- knows today is the old Ally colours: about 105,000 contacts across roughly
-- 500 users, imported and rescored on 21 August. That set does not grow. On
-- its own it starves Chorus within weeks, and then the rule that protects
-- people also silences the engine.
--
-- The founder named the two sources that DO grow, and this table is where both
-- of them land:
--
--   stated_close   — the user said so, in ordinary conversation ("that's the
--                    second engine plus the first engine"). One answer does two
--                    jobs: it records a warm tie AND names a target.
--   ask_answered   — someone answered this user's relayed question, or this
--                    user answered theirs. Two people who write back to each
--                    other have a real tie ("when people are responding to
--                    each other, you must identify relations between them").
--   intro_accepted — an introduction this user asked for was accepted, or they
--                    accepted one. Same evidence, stronger.
--
-- An append-only ledger, not a score column: the score is a reading of the
-- evidence and the rules for reading it will change, but „on 4 September Nino
-- answered Giorgi's question" stays true whatever the formula becomes. It also
-- means the founder can always be shown WHY someone was called warm.
CREATE TABLE IF NOT EXISTS warmth_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL,
  contact_phone TEXT        NOT NULL,
  kind          TEXT        NOT NULL,
  weight        REAL        NOT NULL,
  -- What produced it (ask_id, request_id, 'chat'), for the audit trail.
  ref           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE warmth_events DROP CONSTRAINT IF EXISTS warmth_events_kind_check;
ALTER TABLE warmth_events ADD CONSTRAINT warmth_events_kind_check
  CHECK (kind IN ('stated_close', 'ask_answered', 'intro_accepted'));

-- The reader is always "this user's warmth toward these phones", and the
-- window is recent-first.
CREATE INDEX IF NOT EXISTS idx_warmth_events_user_phone
  ON warmth_events (user_id, contact_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warmth_events_phone
  ON warmth_events (contact_phone);

-- One automatic event per source per pair per day: two people trading four
-- messages in an afternoon are not four times as close as two who traded one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warmth_events_daily
  ON warmth_events (user_id, contact_phone, kind, (created_at::date));
