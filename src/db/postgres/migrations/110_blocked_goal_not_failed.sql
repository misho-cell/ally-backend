-- 110: a goal waiting for its owner is not a failed run (ticket 9 task 20 b).
--
-- Thread 9406 on 3 September: the wake run registered goal 1519's question at
-- 02:31:13 — the badge correctly became „შენი პასუხი სჭირდება" — and six
-- seconds later the same run's empty final overwrote it with `failed`,
-- „შეფერხდა — სცადე თავიდან". The founder was told to retry a run while the
-- goal on that thread was waiting for HIM. The code no longer lets a failure
-- overwrite a standing question; this repairs the rows already written that
-- way.
--
-- Narrow on purpose: only a thread that is failed RIGHT NOW and carries an
-- OPEN goal with an unanswered question. A failed thread with no such goal is
-- correctly failed and is not touched. Predicted and verified live before
-- running: exactly one row (thread 9406, goal 1519, account 501).
--
-- status_line takes the Georgian default rather than the thread's own
-- language: the language of a run is known when the run happens, not here,
-- and every affected thread is Georgian. The next run rewrites the caption in
-- the conversation's language anyway.
UPDATE threads t
SET status = 'needs_you',
    status_line = 'შენი პასუხი სჭირდება',
    is_task = TRUE,
    updated_at = NOW()
WHERE t.status = 'failed'
  AND EXISTS (
    SELECT 1 FROM tasks k
    WHERE k.thread_id = t.id
      AND k.status = 'open'
      AND k.pending_question_at IS NOT NULL
  );
