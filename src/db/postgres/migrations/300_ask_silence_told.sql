-- 300: Board #7760 — an ask to somebody who does not answer sat as „sent", and the asker heard
-- nothing until the two-week expiry (#1684). After a few days without an answer the asker's goal
-- is woken with a factual line, once per ask; this column is the „told once".
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS silence_told_at TIMESTAMPTZ;
