-- #4786 (the tester's 06:40Z, Mon 19 Oct): the weekly summary hung off a
-- timer started at boot. The 05:58Z deploy replaced the container at 06:00Z,
-- two people into the run; the new process booted at 06:00:30, found 06:00
-- already past and scheduled the next Monday. Its slot now lives here, like
-- the hourly sweeps' (181). Seeded in the past, so the first poll is due.
INSERT INTO sweep_runs (name, last_run_at)
VALUES ('weekly_summary', NOW() - INTERVAL '1 day')
ON CONFLICT (name) DO NOTHING;
