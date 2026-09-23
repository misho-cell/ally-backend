-- Row 256 — „goals solved … per day and per week", and the day could not be
-- answered at all.
--
-- The screen the seat asked for needs to put a closed goal on a date. There is
-- no column that records when a goal closed. `tasks` carries `status`,
-- `closed_as` and `closed_reason` — WHAT happened, never WHEN — and the
-- nearest thing, `updated_at`, moves whenever anything touches the row.
--
-- `goalDashboard.service` has been reporting `closed_at: iso(row.updated_at)`
-- for a closed goal since it was written. That is right most of the time and
-- is not a record: any later write — a wake cleared, a thread retitled, a
-- backfill — moves it, and nothing marks which rows moved.
--
-- WHAT THIS CANNOT DO, said here rather than discovered later: 422 goals are
-- already closed and NONE of them can be dated. The information was never
-- captured, and a backfill from `updated_at` would manufacture 422 dates that
-- look exactly like measured ones. The series therefore starts empty and
-- fills from today; the report says so in a field rather than letting a reader
-- assume the pilot closed nothing before 23 September.
--
-- That is the same shape as `closed_as` itself two weeks ago: „Old rows are
-- untouched — 188 of them, and nothing can fix those."
--
-- REOPENING CLEARS IT. „When did this goal close" has no answer for a goal
-- that is open, and a stale date left behind would put a live goal in the
-- solved column of a past week.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- The report asks „which goals closed on this day", so the index is on the day.
CREATE INDEX IF NOT EXISTS idx_tasks_closed_at ON tasks (closed_at) WHERE closed_at IS NOT NULL;
