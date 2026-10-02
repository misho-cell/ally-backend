-- Giorgi's Claude, 2 October (G-001/G-002): a board row could not be removed,
-- so a duplicate stayed on the board. A delete only hides the row: it keeps the
-- time and the login that removed it, and setting deleted_at back to NULL
-- restores it.
ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS deleted_by TEXT;
