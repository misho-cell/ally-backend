-- 294: #8945 (battery 5 Nov; founder) — when a go-between says yes and the target is a Netai
-- member, the target is asked first; the number moves (or a chat opens, #8878) only after the
-- target's own yes. The target's thread holding the question, when it was asked, and the answer.
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS target_thread_id INTEGER NULL;
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS target_asked_at TIMESTAMPTZ NULL;
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS target_answered_at TIMESTAMPTZ NULL;
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS target_said_yes BOOLEAN NULL;
CREATE INDEX IF NOT EXISTS introduction_requests_target_thread_idx
  ON introduction_requests (target_thread_id)
  WHERE target_thread_id IS NOT NULL AND target_answered_at IS NULL;
