-- 5446, founder ruling D792 (16 Oct): a goal solved with a helper's answer is
-- remembered on the helper, silently. Never shown to anyone and never asked of
-- the helper; read only by search, where a match ranks the helper as a
-- structured hit and the model is told to offer them without a reason (BP).
-- case_text is the goal's own words (title, then description), the words a
-- later asker's search is matched against.
CREATE TABLE IF NOT EXISTS helper_solved_cases (
  id             BIGSERIAL PRIMARY KEY,
  helper_user_id INTEGER NOT NULL,
  owner_user_id  INTEGER NOT NULL,
  task_id        INTEGER NOT NULL,
  case_text      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (helper_user_id, task_id)
);

CREATE INDEX IF NOT EXISTS helper_solved_cases_helper_idx
  ON helper_solved_cases (helper_user_id);
