-- 292: #8625 (DR12; Misho's yes, 4 Nov): how many reminders a goal has had since a person
-- last wrote in it, so a goal nobody answers is reminded at two days, asked once at five
-- days whether to close, and then left quiet instead of re-raised every day.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS idle_reminders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS idle_reminded_at TIMESTAMPTZ;
