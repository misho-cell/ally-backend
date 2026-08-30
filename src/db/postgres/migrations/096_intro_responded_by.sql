-- 096: Ticket 8 Task 3 (Q-36) — the accepted row carries WHO responded.
-- For a mediated request that was always mediator_user_id; a DIRECT request
-- (mediator NULL, the target answers for themself) had no responder column at
-- all — request 925 read as "accepted by nobody". One column, set at resolve
-- time on every path, backfilled from what each row already implies.

ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS responded_by_user_id INTEGER;

UPDATE introduction_requests
SET responded_by_user_id = COALESCE(mediator_user_id, target_user_id)
WHERE status IN ('accepted', 'declined') AND responded_by_user_id IS NULL;
