-- 058: profile photos (Lika's item 9 — Edit Profile). Stored IN Postgres on
-- purpose: at this scale (hundreds of users, one ≤300KB image each) an object
-- store is infrastructure without a payoff, and keeping the bytes next to the
-- account means the erasure cascade covers them with one more table row.
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    INTEGER PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
