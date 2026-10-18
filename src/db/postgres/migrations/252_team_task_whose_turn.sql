-- Board #5809 (the founder's D828): whose next move a row waits on is a stored
-- field, not a guess read from its status. One of the seven seats, or NULL for
-- the rows that were on the board before this column — the tester fills those.
-- NULL passes the CHECK by itself; it is spelled out so the rule reads whole.
ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS whose_turn TEXT;
ALTER TABLE team_tasks DROP CONSTRAINT IF EXISTS team_tasks_whose_turn_check;
ALTER TABLE team_tasks ADD CONSTRAINT team_tasks_whose_turn_check
  CHECK (whose_turn IS NULL OR whose_turn IN ('misho', 'mishos_claude', 'giorgi', 'lika',
                                              'ninia', 'tornike', 'tester'));

-- GET /admin/team-tasks?whose_turn=… filters by it, with or without a page.
CREATE INDEX IF NOT EXISTS team_tasks_whose_turn
  ON team_tasks (whose_turn, page) WHERE deleted_at IS NULL;
