-- Row 272 — SHORT FEEDBACK QUESTIONS AFTER A GOAL IS CLOSED.
--
-- The founder's vision document asks for them. The tester confirmed on
-- 25 September that nothing was built: the five „feedback" rows in the question
-- bank are general and tied to nothing, no path fires on closing a goal, and
-- usage.feedback_answers reads 0 — the truth, not a reporting gap.
--
-- ⚠️ AND THE QUESTION BANK IS THE WRONG HOME FOR THEM, which I found only by
-- reading it rather than assuming. All 43 rows there carry `options` and a
-- `select_mode` of single or multi: it is a MULTIPLE-CHOICE bank. The
-- founder's six are open questions — „what did you want to resolve?", „where
-- did you have to step in?" — and putting them there would have meant
-- inventing options nobody asked for, or a NULL where every reader expects a
-- list.
--
-- I also nearly set `goal_bound = true` on them, which reads well and would
-- have been fatal: that flag means „asked only while a goal is OPEN". These
-- are asked when one CLOSES. The flag would have made them never fire, and the
-- table would have looked correctly configured.

CREATE TABLE IF NOT EXISTS goal_feedback (
  id           SERIAL PRIMARY KEY,
  task_id      INTEGER     NOT NULL,
  user_id      TEXT        NOT NULL,
  -- Which of the six. A key rather than the text, so rewording a question
  -- later does not orphan the answers already given to it.
  question_key TEXT        NOT NULL,
  answer       TEXT        NOT NULL,
  asked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, question_key)
);

-- „Readable in the admin" means per goal and per person, and those are the
-- two ways it will be read.
CREATE INDEX IF NOT EXISTS goal_feedback_task_idx ON goal_feedback (task_id);
CREATE INDEX IF NOT EXISTS goal_feedback_user_idx ON goal_feedback (user_id, answered_at DESC);
