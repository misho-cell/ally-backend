-- 124: who pays for a chain (Ticket 10 Task 25 (a); D123, 7 Sep).
--
-- The founder's ruling: the original requester pays for the entire
-- assistant-to-assistant task. Misho asks, Tornike's assistant answers
-- (Tornike's cost 0), Tornike's assistant asks a third assistant (still
-- Misho's account), the chain returns (still Misho's). Helpers' budgets are
-- never charged, paying or not.
--
-- Every ask therefore carries the account the chain started from. A direct
-- ask starts with its sender; a relay inherits its parent's origin. Runs on
-- an incoming-ask thread are then allowed and charged against the origin's
-- wallet, not the helper's.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS origin_user_id INTEGER;

-- Backfill: a direct ask's origin is its sender; a relay's is its parent's.
-- Relays are one level deep (relayAskInner refuses a relay of a relay), so
-- two passes cover the history.
UPDATE task_asks SET origin_user_id = from_user_id
  WHERE origin_user_id IS NULL AND parent_ask_id IS NULL;
UPDATE task_asks c SET origin_user_id = p.origin_user_id
  FROM task_asks p
  WHERE c.origin_user_id IS NULL AND c.parent_ask_id = p.id AND p.origin_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_asks_origin ON task_asks (origin_user_id);
