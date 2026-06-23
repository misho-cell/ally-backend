UPDATE "User"
SET subscription_tier      = 'premium',
    subscription_status    = 'active',
    current_period_ends_at = '2099-01-01 00:00:00+00',
    "updatedAt"            = NOW()
WHERE "hasAccessToAlly" = true;

ALTER TABLE "User" DROP COLUMN IF EXISTS "hasAccessToAlly";
