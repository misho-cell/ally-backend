-- 135: Ticket 14 Task 63. An erased account still read subscription_status
-- 'active' (one live row on 10 Sep). The erasure path now sets 'inactive';
-- this backfills the rows erased before it did. Idempotent.
UPDATE "User"
SET subscription_status = 'inactive'
WHERE "deletedAt" IS NOT NULL
  AND subscription_status IN ('active', 'trialing', 'past_due');
