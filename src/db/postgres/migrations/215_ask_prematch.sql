-- 1694 (A11, D679/D680): before somebody is asked, one check inside THEIR OWN
-- account context says whether they can likely help. Only the one word leaves
-- that context; it orders the waves and is shown on the admin's ask record.
-- The asker's goal and messages never carry it. NULL on every older ask.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS prematch TEXT
  CHECK (prematch IS NULL OR prematch IN ('likely_yes', 'possibly', 'not_his_field', 'ask_him'));
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS prematch_source TEXT;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS prematch_at TIMESTAMPTZ;
