-- 265: #7195 / #7459 retest (tester 74813): a helper's addition woke the asker's goal with the
-- whole answer again, and the asker's assistant read it as „the same answer, nothing new".
-- The answer as it last reached the asker, so a wake carries only what came after it.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS delivered_answer TEXT;
