-- Row 258 (D466) — a closed TEST goal leaves the owner's list, and NOTHING
-- else about it changes.
--
-- THE FOUNDER, 23 September, choosing between two things he had been offered:
-- D450 said stop-and-remove, which would have sent „no longer needed" to three
-- real people who had already been asked. He was shown that and the read-only
-- alternative, and he answered: HIDE.
--
-- So D450's „remove" is withdrawn and D245 stands — a goal is never deleted,
-- only closed. This is the third thing: not deleted, not closed, not stopped.
-- Just not listed to the one person whose list it clutters.
--
-- A LIST AND NOT A RULE, and that is the whole design. Nothing here infers
-- „this looks like a test" from a title, a date or an account. 261 of account
-- 501's goals are closed and I have read a fraction of them; a rule applied by
-- me to rows nobody has looked at is exactly the shape that produces one
-- hidden goal somebody wanted. Every row in this table was named by a person.
--
-- CLOSED ONLY, enforced where it is written rather than remembered. The seat's
-- own check is that the OPEN-GOAL COUNT DOES NOT MOVE, and the cheapest way to
-- keep that true is to make an open goal impossible to hide in the first
-- place.
--
-- IT CHANGES NOTHING FOR ANYBODY ELSE. The founder's ruling says so in those
-- words. A hidden goal is still readable by id, still carries its asks, still
-- appears wherever another account's data touches it — a relay, an answer, a
-- thread. Only `getMyTasks`, the owner's own listing, skips it.
--
-- `reason` IS REQUIRED because a hidden row with no reason is indistinguishable
-- from a mistake six weeks later, and the undo is a DELETE from this table,
-- which restores the goal to the list exactly as it was.
CREATE TABLE IF NOT EXISTS hidden_goals (
  task_id    INTEGER     PRIMARY KEY,
  hidden_by  TEXT        NOT NULL,
  reason     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
