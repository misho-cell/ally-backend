-- BH (§128, the frontend's 06:30Z item 7): the monthly „sync your contacts
-- again" push goes at most once a month; this is when it last went.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS contact_import_reminded_at TIMESTAMPTZ;
