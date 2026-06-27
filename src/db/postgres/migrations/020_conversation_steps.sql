-- Persist the agent's intermediate step narration so it survives reload.
-- kind = 'message' (normal user/assistant turn) or 'step' (live narration).
-- run_id groups the steps and final answer produced by a single message run.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'message';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_thread_kind
  ON conversations (thread_id, kind);
