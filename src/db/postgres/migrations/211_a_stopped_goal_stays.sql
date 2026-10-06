-- #1919 (phone report point 96): „stop this goal" should stop it and leave the
-- conversation in the current list, marked stopped, until the owner closes it.
-- stop_dismissed_at is that close. Goals stopped before today are counted as
-- already closed by their owner, so none of them climbs back into the list.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stop_dismissed_at TIMESTAMPTZ;
UPDATE tasks SET stop_dismissed_at = NOW()
 WHERE status = 'closed' AND closed_as = 'stopped' AND stop_dismissed_at IS NULL;
