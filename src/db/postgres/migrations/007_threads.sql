CREATE TABLE threads (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'regular'
                          CHECK (type IN ('regular', 'incoming_request', 'outgoing_request')),
  title                   TEXT,
  introduction_request_id INTEGER REFERENCES introduction_requests(id),
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_intro_request ON threads(introduction_request_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS thread_id INTEGER REFERENCES threads(id);
CREATE INDEX IF NOT EXISTS idx_conversations_thread_id ON conversations(thread_id);

-- Create a default regular thread for each existing user who has conversations
INSERT INTO threads (user_id, type, title, created_at, updated_at)
SELECT
  c.user_id,
  'regular',
  'Ally Chat',
  MIN(c.created_at),
  MAX(c.created_at)
FROM conversations c
WHERE c.user_id IS NOT NULL
GROUP BY c.user_id
ON CONFLICT DO NOTHING;

-- Assign existing conversations to their user's default thread
UPDATE conversations c
SET thread_id = t.id
FROM threads t
WHERE t.user_id = c.user_id
  AND t.type = 'regular'
  AND c.thread_id IS NULL;
