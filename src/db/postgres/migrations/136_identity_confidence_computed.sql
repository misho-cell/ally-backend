-- 136: Ticket 16 Task 91 (D172). Every candidate carried the flat 0.8. The
-- score is now co_owners / (co_owners + (name_distinct_phones - 1)): accounts
-- that saved BOTH numbers under the name, against how many numbers the name
-- could belong to. Rows without a reach count keep their value. Idempotent.
UPDATE identity_candidates
SET confidence = ROUND(
  LEAST(1, GREATEST(0,
    (evidence->>'co_owners')::numeric
    / NULLIF((evidence->>'co_owners')::numeric
             + GREATEST((evidence->>'name_distinct_phones')::numeric - 1, 0), 0)
  ))::numeric, 2)
WHERE evidence ? 'co_owners' AND evidence ? 'name_distinct_phones'
  AND (evidence->>'name_distinct_phones') IS NOT NULL
  AND (evidence->>'co_owners')::numeric > 0;
