-- 127: line 4 of the standard, in code (Ticket 10 Task 24 (b); D117, D119).
--
-- Three silent days change the method. Until now the rule lived only in the
-- nightly review's prompt text — the model was told, nothing checked. The
-- sweep that now checks stamps the goal it woke, exactly as the silent-day
-- sweep does (migration 122), so a failing run cannot fire the same proposal
-- every hour and a goal is asked to change its method once per three days.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS method_change_woken_at TIMESTAMPTZ;
