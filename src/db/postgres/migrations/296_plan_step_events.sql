-- 296: autonomy stage 2, K2 (Misho, 5 Nov) — where a goal's plan stands.
-- Every run used to start from nothing: no memory of which step of the plan
-- was under way, so each step became a fresh question to the owner. Each
-- step's events are written here, and tasks.plan_step names the current one.
CREATE TABLE IF NOT EXISTS plan_step_events (
  id BIGSERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('started', 'sent', 'answered', 'declined', 'silent', 'named')),
  -- What the event is about: an ask id for sent/answered/declined, an
  -- introduction request id for named; NULL for started/silent.
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_step_events_task_time_idx
  ON plan_step_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_step_events_task_ref_idx
  ON plan_step_events (task_id, kind, ref);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_step TEXT;
