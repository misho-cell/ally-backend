-- #502 (§99.8, Misho 8 Oct): „remind me in 15 minutes" is the owner's own
-- reminder, in any conversation, with or without a goal. The run stores the
-- line the owner will read and when; at due_at the server writes it into the
-- same conversation and rings the owner once. No model runs at that moment.
--
-- sent_at is stamped by the one sweep that delivers it, so a reminder goes once.
CREATE TABLE IF NOT EXISTS owner_reminders (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  thread_id  INTEGER NOT NULL,
  text       TEXT NOT NULL,
  due_at     TIMESTAMPTZ NOT NULL,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_owner_reminders_due ON owner_reminders (due_at) WHERE sent_at IS NULL;
