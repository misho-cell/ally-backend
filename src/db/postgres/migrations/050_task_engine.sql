-- Task engine, phase 1: a task lives beyond single runs. It binds to ONE
-- thread (statuses/UI ride the existing rails), carries the model-written
-- operative brief and an autonomy mode, and can schedule its own wake-ups.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS thread_id    INTEGER,
  ADD COLUMN IF NOT EXISTS autonomy     TEXT NOT NULL DEFAULT 'ask_first'
                                        CHECK (autonomy IN ('ask_first', 'autonomous')),
  ADD COLUMN IF NOT EXISTS brief        TEXT,
  ADD COLUMN IF NOT EXISTS next_wake_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tasks_wake
  ON tasks (next_wake_at) WHERE status = 'open' AND next_wake_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_thread ON tasks (thread_id);

-- Asks: the assistant writes to ANOTHER member on the task's behalf. The
-- recipient gets a thread (type incoming_ask) + push; their plain-text reply
-- lands back on the ask and wakes the task.
CREATE TABLE IF NOT EXISTS task_asks (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL,
  from_user_id  INTEGER NOT NULL,
  to_user_id    INTEGER NOT NULL,
  question      TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent', 'answered', 'declined', 'cancelled')),
  answer        TEXT,
  parent_ask_id INTEGER,
  ask_thread_id INTEGER,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  answered_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_asks_task   ON task_asks (task_id);
CREATE INDEX IF NOT EXISTS idx_task_asks_thread ON task_asks (ask_thread_id);
CREATE INDEX IF NOT EXISTS idx_task_asks_sender ON task_asks (from_user_id, created_at DESC);

-- Recipient-side threads get their own type.
ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_type_check;
ALTER TABLE threads ADD CONSTRAINT threads_type_check
  CHECK (type IN ('regular', 'incoming_request', 'outgoing_request', 'incoming_ask'));
