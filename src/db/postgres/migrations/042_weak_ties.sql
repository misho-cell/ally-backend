-- Weak-tie signals: when a user asks for a PATH to a contact they already hold
-- directly, that edge is weak — they couldn't just call. Stored so that user is
-- down-ranked as a "warm bridge" to that person in OTHER users' second-degree
-- results (bridge quality), never shown to anyone.
CREATE TABLE IF NOT EXISTS weak_tie_signals (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  contact_phone TEXT    NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_weak_tie_phone ON weak_tie_signals (contact_phone);
