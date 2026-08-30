-- 095: Ticket 8 Task 2 — the goal's blocking question becomes VISIBLE.
--
-- The nightly wake worked; what it produced did not reach the owner: the run
-- ended at a question inside a thread nobody was looking at, and the
-- needs_you badge measured "last reply ends with ?" instead of "this thread
-- waits for the user". Two columns and one cleanup:
--
--   tasks.pending_question(_at) — the exact question a goal is blocked on,
--   written by the model (ask_owner_decision) or by the engine's fallback
--   when a wake run ends at a question. Cleared when the owner answers
--   (answer_goal_question, or by writing in the goal's thread) and on close.
--
-- The cleanup: a plain conversation is never "needs you" — the badge is for
-- work items (a goal blocked on the owner, an incoming ask, a campaign
-- invite). 440+ stale flags on the founder's account alone were regular
-- Q&A threads whose last reply happened to end with a question mark, while
-- three of his four genuinely-blocked goals were not flagged.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pending_question TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pending_question_at TIMESTAMPTZ;

-- Regular threads with no open task behind them: whatever their last reply
-- looked like, nothing there waits for the user.
UPDATE threads th
SET status = 'done', status_line = NULL
WHERE th.status = 'needs_you'
  AND th.type = 'regular'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.thread_id = th.id AND t.status = 'open'
  );
