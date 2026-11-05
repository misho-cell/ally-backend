-- 300: Board #7760 — an ask to somebody who does not answer sat as „sent", and the asker heard
-- nothing until the two-week expiry (#1684). After a few days without an answer the asker's goal
-- is woken with a factual line, once per ask; this column is the „told once".
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS silence_told_at TIMESTAMPTZ;
-- Asks already quiet before this ships are not told in one burst on deploy: only silences that
-- begin after it reach the owner (lead session, 5 Nov; ADMIN_WRITE_OPERATIONS entry for 300).
UPDATE task_asks SET silence_told_at = NOW()
 WHERE status = 'sent' AND expired_at IS NULL AND silence_told_at IS NULL;
