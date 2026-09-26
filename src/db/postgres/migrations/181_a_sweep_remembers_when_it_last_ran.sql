-- ⚠️ WORK THAT MUST HAPPEN DAILY WAS LIVING ON A TIMER THAT EVERY DEPLOY RESET.
--
-- `sweepSilentGoals`, `sendDueAskReminders` and `sweepMethodChanges` share one
-- `setInterval` of sixty minutes, started when the process boots. A deploy
-- replaces the container, so the timer starts again from zero — and if the
-- next deploy lands inside the hour, that tick never happens at all.
--
-- MEASURED, 26 September, which is how this was found. Deploys that afternoon:
--
--   11:56 12:08 12:13 12:20 12:34 12:39 12:59 13:05 13:16 13:19
--   13:24 13:39 13:59 14:06 14:11 14:24 14:49 15:10 15:35
--
-- The longest gap is TWENTY-FIVE MINUTES. Not one container lived an hour, so
-- for that whole afternoon none of the three ran even once. Nobody waiting on
-- an unanswered ask was reminded; no goal widened after a silent day; no
-- method change fired. It surfaced because a tester's row-268 test read as
-- „the product did nothing" when in truth nothing had looked.
--
-- ⚠️ AND IT IS NOT A BUSY-DAY PROBLEM. Any day with deploys oftener than the
-- interval silently disables all three, and the symptom is absence — there is
-- no error, no row, and nothing to notice. A quiet failure that scales with
-- how much we are working is the worst shape a scheduled job can have.
--
-- THE FIX IS TO PUT THE CLOCK IN THE DATABASE. A sweep claims its slot here;
-- the claim is what decides whether it runs, not how long this process has
-- been up. A restart then costs nothing: the next tick sees the slot is
-- overdue and takes it.
CREATE TABLE IF NOT EXISTS sweep_runs (
  name         TEXT PRIMARY KEY,
  last_run_at  TIMESTAMPTZ NOT NULL
);

-- Seeded in the past, not at NOW(): a brand-new row must read as OVERDUE, so
-- the first boot after this migration does the work rather than waiting an
-- hour for a slot it has never held. Seeding it to now would reproduce the
-- bug once on every fresh database.
INSERT INTO sweep_runs (name, last_run_at)
VALUES ('ask_reminders',  NOW() - INTERVAL '1 day'),
       ('silent_goals',   NOW() - INTERVAL '1 day'),
       ('method_changes', NOW() - INTERVAL '1 day')
ON CONFLICT (name) DO NOTHING;
