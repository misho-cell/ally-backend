-- 1699 (A16, D679/D680): a need (an open goal) and an offer (A15) in the same
-- field, between two members who can reach each other. Proposed by the
-- nightly matcher; the two no-name cards move it on (need_yes → both_yes /
-- declined / expired). A pair that was declined is not proposed again for
-- 90 days; every match expires 14 days after it is made.
CREATE TABLE IF NOT EXISTS matches (
  id             BIGSERIAL PRIMARY KEY,
  need_goal_id   INTEGER     NOT NULL,
  need_user_id   INTEGER     NOT NULL,
  offer_id       BIGINT      NOT NULL,
  offer_user_id  INTEGER     NOT NULL,
  score          REAL        NOT NULL DEFAULT 1,
  state          TEXT        NOT NULL DEFAULT 'proposed',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  UNIQUE (need_goal_id, offer_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_pair ON matches (need_user_id, offer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches (state, created_at);
