-- Invite-only registration gate.
-- NOTE: the legacy "FeatureFlags" table types featureName as the Prisma enum
-- "FeatureType", which does not contain 'invite_only' and cannot be extended
-- inside this transactional migration runner — so the gate keeps its flag in
-- its own plain-text table instead.
CREATE TABLE IF NOT EXISTS app_flags (
  flag       TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Off by default — enabling is an explicit admin action.
INSERT INTO app_flags (flag, enabled)
VALUES ('invite_only', false)
ON CONFLICT (flag) DO NOTHING;

-- Social-proof check counts how many users have the registering phone in
-- their contact books (UserAlias filtered by phone), so phone needs a btree.
CREATE INDEX IF NOT EXISTS idx_user_alias_phone ON "UserAlias" (phone);
