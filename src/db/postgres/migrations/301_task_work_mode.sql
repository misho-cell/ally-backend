-- 301: Misho, 8 Nov — two ways to work a goal. 'plan' (the default): the owner agrees each
-- plan, as before. 'free': the owner's standing yes on this topic — the server approves the
-- plans the run proposes, within a daily cap of new people, and reports once in the evening.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_mode TEXT NOT NULL DEFAULT 'plan'
  CHECK (work_mode IN ('plan', 'free'));
-- The local date of the last evening report of a free-mode goal: one report a day.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS free_report_date DATE;
