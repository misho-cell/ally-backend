-- 123: the answer rule approved once (Ticket 10 Task 22; D120, 7 Sep).
--
-- The founder's ruling: the recipient talks only to their own assistant (D48);
-- when the assistant already knows the answer to an incoming question it shows
-- it and asks two things at once — send it now, and answer similar questions
-- this way in future. From then on a matching question is answered
-- automatically, the ask row says so, and the weekly summary lists it.
--
-- A rule is the user's own standing answer to one KIND of question: the words
-- they approved, the question that produced it, and their own one-line
-- description of what it covers. It is theirs to see and delete.
CREATE TABLE IF NOT EXISTS answer_rules (
  id               BIGSERIAL   PRIMARY KEY,
  user_id          INTEGER     NOT NULL,
  -- The assistant's one-line description of the kind of question, shown to
  -- the user when the rule is offered and when they review their rules.
  kind             TEXT        NOT NULL,
  -- The question that produced the rule — what later questions are matched
  -- against, together with `kind`.
  sample_question  TEXT        NOT NULL,
  -- The approved answer, sent verbatim.
  answer           TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  uses             INTEGER     NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answer_rules_user_active ON answer_rules (user_id) WHERE active;

-- An ask answered by a rule says so, and names the rule — the weekly summary
-- counts these, and a reader can tell an automatic answer from a typed one.
ALTER TABLE task_asks
  ADD COLUMN IF NOT EXISTS automatic      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS answer_rule_id BIGINT;
