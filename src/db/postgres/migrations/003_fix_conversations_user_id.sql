-- conversations.user_id was incorrectly created as UUID.
-- User.id is a SERIAL integer, so this column must be INTEGER.
-- The table has never held valid data (all inserts failed), so DROP is safe.

DROP TABLE IF EXISTS conversations;

CREATE TABLE conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL,
  role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id, created_at DESC);
