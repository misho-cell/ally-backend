-- 122: line 3 of the standard, in code (Ticket 10 Task 24 (a); D117, D119).
--
-- "A silent day = ask more people — inside the approved circle." Until now
-- this was a sentence in the nightly prompt, and the nightly run only reaches
-- goals with no wake scheduled. The engine now finds, on its own, every goal
-- whose last question has sat unanswered for a day with nothing new sent, and
-- wakes it with the instruction to widen the circle. Once per silent day —
-- which is what this stamp is for.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS silent_day_woken_at TIMESTAMPTZ;
