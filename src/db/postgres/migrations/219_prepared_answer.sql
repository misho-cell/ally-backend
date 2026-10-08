-- 1695 (A12, D679/D680): on a likely_yes pre-match, one line the recipient
-- could send as his answer, composed from his own profile only. Stored on the
-- ask in his account, shown only to him under „yes", sent only on his tap.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS prepared_answer TEXT;
