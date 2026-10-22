-- 261: #7360 (founder's word D871/D873, 22 Oct): Netai's OWN message to one real user —
-- an apology, news, a match — in a conversation titled „Netai", not from any member's
-- assistant. One row per message the team sent; the conversation row itself is in
-- `conversations` like every other message. seen_at is when the user opened that
-- conversation after it arrived; reply is the user's own answer there (no model runs).
CREATE TABLE IF NOT EXISTS netai_messages (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  thread_id   INTEGER NOT NULL,
  body        TEXT NOT NULL,
  choices     JSONB,
  sent_by     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at     TIMESTAMPTZ,
  reply       TEXT,
  replied_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_netai_messages_thread ON netai_messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_netai_messages_user ON netai_messages (user_id, sent_at DESC);
