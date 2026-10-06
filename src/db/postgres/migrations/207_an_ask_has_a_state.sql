-- #1684 (A1, D679/D680): one record per ask, with a state the owner can read.
--
-- The record already exists: task_asks. What it lacked is the part of the
-- state nobody wrote down — whether the reader opened the conversation, until
-- when a „later" holds, and that two weeks of silence are an end and not a
-- wait. Those are columns, not new statuses: migration 180 kept `status` to
-- sent/answered/cancelled on purpose, because six readers depend on it, and
-- the state is computed from these stamps instead (askState.ts).
--
-- wave_no and field are filled by A2 and A8; they are here so the record has
-- its final shape once.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS later_until TIMESTAMPTZ;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS wave_no INT;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS field TEXT;

-- The expiry sweep reads unanswered asks by age.
CREATE INDEX IF NOT EXISTS task_asks_open_by_age
  ON task_asks (created_at) WHERE status = 'sent' AND expired_at IS NULL;

-- The owner is told of an expired ask once: the wake that tells it stamps this.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS expiry_told_at TIMESTAMPTZ;

-- The hourly expiry sweep claims its slot like the other three (181).
INSERT INTO sweep_runs (name, last_run_at)
VALUES ('ask_expiry', NOW() - INTERVAL '1 day')
ON CONFLICT (name) DO NOTHING;

-- The backlog: asks already past two weeks on the day this ships (59 on
-- 6 October) close quietly. Telling their owners now would wake every such
-- goal in the same hour about questions from August; only an ask that
-- crosses the line from here on is told.
UPDATE task_asks SET expired_at = NOW(), expiry_told_at = NOW()
 WHERE status = 'sent' AND expired_at IS NULL
   AND created_at < NOW() - INTERVAL '14 days';
