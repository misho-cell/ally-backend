-- Invite-only registration gate.
-- 1. Feature flag row (off by default — enabling is an explicit admin action).
INSERT INTO "FeatureFlags" ("isEnabled", "createdAt", "updatedAt", "featureName")
SELECT false, NOW(), NOW(), 'invite_only'
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlags" WHERE "featureName" = 'invite_only'
);

-- 2. Social-proof check counts how many users have the registering phone in
--    their contact books (UserAlias filtered by phone), so phone needs a btree.
CREATE INDEX IF NOT EXISTS idx_user_alias_phone ON "UserAlias" (phone);
