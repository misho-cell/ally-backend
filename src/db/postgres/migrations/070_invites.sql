-- 070: the invite record (engine T11, approved 20 Aug as specced): a personal
-- invite per contact, carrying the user's referral code — recorded so the
-- assistant never offers the same invite twice and the founder sees uptake.
CREATE TABLE IF NOT EXISTS invites (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name  TEXT,
  referral_code TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_once ON invites (user_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_invites_user ON invites (user_id, created_at DESC);
