-- 112: a relayed conversation can continue (ticket 9 task 12, the founder's
-- instruction of 1 September).
--
-- Until now one goal could put exactly ONE question on one person's phone.
-- Lika asked Tornike when he was free, he answered „day after tomorrow, tell
-- me the time", she typed „12:00" — and her assistant told her the truth: the
-- system would not send more in that conversation. Two people agreed to meet
-- and the last step, the hour, never arrived.
--
-- Follow-up messages are now allowed, and they are a different animal from a
-- cold question, so the row says which it is:
--
--   is_follow_up = FALSE — outreach. Spends the monthly growth budget and the
--                          one-growth-ask-per-conversation floor.
--   is_follow_up = TRUE  — a message inside a live relayed conversation with
--                          someone who is already talking back. Spends neither;
--                          capped per person, per goal, per day instead.
--
-- Every existing row is outreach: the old counter made anything else
-- impossible, so FALSE is not a guess, it is the history.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN task_asks.is_follow_up IS
  'TRUE when this message continues a live relayed conversation with the same person on the same goal (ticket 9 task 12). FALSE = outreach, which spends the growth budget.';
