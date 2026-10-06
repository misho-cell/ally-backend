-- #1685 (A2, D679/D680): an approved plan asks its people in waves — three at
-- once (five for real work), the next three when the first are all closed or
-- at the silent-day wake. The goal remembers which wave is open; each ask
-- remembers which wave it went in (task_asks.wave_no, migration 207).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ask_wave INT NOT NULL DEFAULT 1;
-- When the silent-day wake would open the next wave: a day after the wave's
-- latest ask.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_wave_at TIMESTAMPTZ;
-- A question held by the recipient's daily cap belongs to the wave it was
-- written in, and counts as open in it until it goes.
ALTER TABLE held_asks ADD COLUMN IF NOT EXISTS wave_no INT;

-- The goals already in flight: what they asked before today is their first
-- wave. Left unnumbered, every open goal would read „nothing sent in this
-- wave" at its next run and write to three more people at once.
UPDATE task_asks SET wave_no = 1
 WHERE wave_no IS NULL AND parent_ask_id IS NULL AND is_follow_up = FALSE
   AND task_id IN (SELECT id FROM tasks WHERE status = 'open');
