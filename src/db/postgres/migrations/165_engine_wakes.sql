-- Ticket 20 rows 231 and 239 — a wake that the process forgets is a wake that
-- never happens, and the owner is told it already has.
--
-- MEASURED 22 September, every approval in the preceding seven days, from
-- approve_task_plan to the first ask actually sent:
--
--   approvals                                  41
--   day one ran (7-67 seconds)                 30
--   owner waited for the NEXT DAY (~86,450 s)   9
--   other delays (5,233 s and 72,114 s)         2
--
-- Eleven of forty-one — 27% — never got their first day at all; the +24h
-- fallback wake rescued them a day later. And while that happens the product
-- tells the owner, in the ask refusal it writes itself, that „day one is
-- already starting behind your reply".
--
-- The cause is that `wakeWhenFree` is a `setTimeout` inside the process. Any
-- restart between the approval and the wake loses it with nothing on disk to
-- retry. Last night my own deploy killed a live run mid-answer; this is the
-- same fault one layer along, and it is why both rows want one fix.
--
-- So a wake becomes a ROW with a due time. The in-process timer stays — it is
-- instant and it works three times in four — and this is the net under it: a
-- sweeper picks up anything still unclaimed after its due time, so a restart
-- costs a minute instead of a day.
--
-- Claimed with an UPDATE ... RETURNING, so two sweepers cannot both take one
-- row.
--
-- THE SENTENCE THAT WAS HERE SAID „so the timer and the sweeper cannot both run
-- the same wake whatever the timing", and that was not true. The timer never
-- claims anything — it does not touch this table until it has finished — so the
-- claim cannot see it and cannot exclude it. What actually keeps them apart is
-- `wakeDoneSince` in engineWakes.service.ts, which asks whether somebody else
-- closed this wake after the caller was queued. Corrected in place on
-- 22 September, comment only; the DDL below is unchanged and has not re-run.
--
-- NO PAYLOAD COLUMN. The first draft carried the event text, and the text is
-- not a string — it is one sentence per language, chosen at wake time. The
-- sweeper dispatches by `kind` and the code supplies its own words, so a
-- payload column would hold a copy that could only go stale. A kind that ever
-- needs one can have a migration then.
CREATE TABLE IF NOT EXISTS engine_wakes (
  id          BIGSERIAL PRIMARY KEY,
  task_id     INTEGER     NOT NULL,
  kind        TEXT        NOT NULL,
  due_at      TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,
  done_at     TIMESTAMPTZ,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open wake of a kind per goal: a second approval of the same plan must
-- not queue a second day one. Partial, so the history of finished wakes is
-- kept and only the live ones are unique.
CREATE UNIQUE INDEX IF NOT EXISTS engine_wakes_one_open_per_task
  ON engine_wakes (task_id, kind) WHERE done_at IS NULL;

-- The sweeper's own query: overdue, unclaimed, oldest first.
CREATE INDEX IF NOT EXISTS engine_wakes_due
  ON engine_wakes (due_at) WHERE done_at IS NULL;
