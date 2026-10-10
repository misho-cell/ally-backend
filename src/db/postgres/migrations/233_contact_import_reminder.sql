-- The frontend's 06:30Z item 7 (Misho, the new design, onboarding B6/B7): the
-- monthly „sync your contacts again" reminder is the person's own switch. Off
-- until they turn it on; the reminder itself waits for its text's yes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS contact_import_reminder BOOLEAN NOT NULL DEFAULT FALSE;
