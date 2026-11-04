-- 295: #8878 (founder, 4 Nov) — after an introduction gets both yeses (the go-between's and the
-- target's, #8945), the two members get a chat of their own: one ordinary thread each, linked
-- here, and what one writes in theirs reaches the other's.
CREATE TABLE IF NOT EXISTS meeting_chats (
  id SERIAL PRIMARY KEY,
  intro_request_id INTEGER NOT NULL UNIQUE,
  asker_user_id INTEGER NOT NULL,
  asker_thread_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  target_thread_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS meeting_chats_asker_thread_idx ON meeting_chats (asker_thread_id);
CREATE INDEX IF NOT EXISTS meeting_chats_target_thread_idx ON meeting_chats (target_thread_id);
