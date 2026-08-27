-- 087: Ticket 7 Task 13 (engine T9, founder's ruling D49) — the debrief
-- question. The clock: 3 days after an introduction or a relayed ask reaches
-- sent/accepted with no outcome recorded, and after an 'accepted' search
-- outcome. Once per introduction — this table's own primary key is that
-- guarantee, the same shape thanks_loop_offers uses for "never twice".
-- Delivery reuses pending_updates (queueFollowUp); nothing here stores the
-- question itself.

CREATE TABLE IF NOT EXISTS debrief_arms (
  kind     TEXT    NOT NULL CHECK (kind IN ('intro_request', 'task_ask', 'search')),
  ref_id   BIGINT  NOT NULL,
  user_id  INTEGER NOT NULL,
  armed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, ref_id)
);

-- The debrief's answer lands as an outcome rung. Searches already have the
-- six-rung ladder on search_activity (D39); introductions and relayed asks
-- get theirs on outcome_events — extend its CHECKs (069) with the two
-- debrief rungs and the task_ask subject.
ALTER TABLE outcome_events DROP CONSTRAINT IF EXISTS outcome_events_subject_type_check;
ALTER TABLE outcome_events ADD CONSTRAINT outcome_events_subject_type_check
  CHECK (subject_type IN ('intro_request', 'draft', 'suggestion', 'task', 'task_ask'));

ALTER TABLE outcome_events DROP CONSTRAINT IF EXISTS outcome_events_outcome_check;
ALTER TABLE outcome_events ADD CONSTRAINT outcome_events_outcome_check
  CHECK (outcome IN ('declined', 'no_reply', 'dropped', 'rerouted', 'accepted', 'worked', 'did_not_work'));
