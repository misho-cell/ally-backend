-- Engine T3 (ticket 6, 20 Aug spec): the generic invite LINK's funnel.
-- "registered" already exists (User."inviterReferralUserId", set at
-- registration whenever a referral code resolves) — this table adds the two
-- steps before it. 'sent' is recorded when the assistant surfaces the share
-- box; 'opened' when the shared link's landing page is actually visited.
CREATE TABLE IF NOT EXISTS referral_link_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('sent', 'opened')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_link_events_user ON referral_link_events (user_id, event);
