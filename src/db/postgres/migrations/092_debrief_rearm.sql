-- 092: the founder's yes (29 Aug, via Misho) on the tester's re-arm
-- suggestion: a debrief answered "we have not met yet" re-queues ONCE on the
-- same 3-day clock, then stops for good. rearmed_at IS NULL is the one-shot
-- guard — the same never-twice shape as the arm itself. Additive nullable
-- column: safe DDL.
ALTER TABLE debrief_arms ADD COLUMN IF NOT EXISTS rearmed_at TIMESTAMPTZ;
