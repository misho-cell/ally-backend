-- B1 + C: goals/needs and character notes must survive between chats. Today a
-- goal dies when the thread closes; the assistant can't remember the job or what
-- the user told it about themselves. Two user-owned stores (no cross-joins, so
-- user_id is plain TEXT to match the string userId used everywhere else).

-- A standing goal the assistant works on across sessions.
CREATE TABLE IF NOT EXISTS tasks (
  id                 SERIAL PRIMARY KEY,
  user_id            TEXT    NOT NULL,
  title              TEXT    NOT NULL,
  description        TEXT,
  -- 'solve' = find helpers / fan out; 'reach' = orchestrate a path to one target.
  task_type          TEXT    NOT NULL DEFAULT 'solve' CHECK (task_type IN ('solve', 'reach')),
  status             TEXT    NOT NULL DEFAULT 'open'   CHECK (status IN ('open', 'paused', 'closed')),
  -- The single "ok to ask around" consent. Outreach must refuse without it.
  permission_granted BOOLEAN NOT NULL DEFAULT false,
  closed_reason      TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);

-- What the user tells the assistant about THEMSELF (not about a contact).
CREATE TABLE IF NOT EXISTS user_notes (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('need', 'preference', 'profile')),
  text       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  worked_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user_kind ON user_notes (user_id, kind);
