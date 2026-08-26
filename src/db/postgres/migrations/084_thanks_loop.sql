-- Ticket 6, engine T12: "Thanks-loop with consent". One row per invited
-- user, ever — the primary key itself is the "never twice about the same
-- invited person" guard: a second offer attempt is a no-op ON CONFLICT, not
-- something application code has to remember to check.

CREATE TABLE IF NOT EXISTS thanks_loop_offers (
  invited_user_id INTEGER PRIMARY KEY,
  inviter_user_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'offered',
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

ALTER TABLE thanks_loop_offers DROP CONSTRAINT IF EXISTS thanks_loop_offers_state_check;
ALTER TABLE thanks_loop_offers ADD CONSTRAINT thanks_loop_offers_state_check
  CHECK (state IN ('offered', 'consented', 'declined'));

CREATE INDEX IF NOT EXISTS idx_thanks_loop_offers_inviter ON thanks_loop_offers (inviter_user_id);
