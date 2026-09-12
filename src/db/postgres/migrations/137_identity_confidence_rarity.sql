-- 137: Ticket 17 Task 91. Migration 136 scored a pair as
-- co_owners / (co_owners + name_distinct_phones - 1). Measured against the 160
-- pairs the founder and Lika actually decided, co_owners alone scores AUC 0.378
-- — below a coin flip, i.e. more owners predicts TWO people, not one. The cause:
-- the same 26 accounts sit on all 23 of the 26-owner pairs, one shared phonebook
-- counted 26 times. Rarity alone scores 0.799 against the same answers.
-- co_owners stays on the row as evidence; it no longer orders the queue.
-- Idempotent.
UPDATE identity_candidates
SET confidence = ROUND(
  (1.0 / GREATEST((evidence->>'name_distinct_phones')::numeric - 1, 1))::numeric, 2)
WHERE evidence ? 'name_distinct_phones'
  AND (evidence->>'name_distinct_phones') IS NOT NULL;
