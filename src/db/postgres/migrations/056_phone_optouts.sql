-- 056: phone-level opt-out, the half of the right-to-erasure that must SURVIVE
-- the account (ticket 4, item 0). ask_optouts is keyed by user_id, which stops
-- existing when the account is erased — without this table a deleted account's
-- number could be re-imported by any contact list and contacted again the same
-- day. Checked by createAsk alongside the user-level opt-out, and the storage
-- the non-user rights portal (POST /privacy/my-data/opt-out) will reuse.
CREATE TABLE IF NOT EXISTS phone_optouts (
  phone_digits TEXT PRIMARY KEY,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Erasure audit: proof that a deletion ran, carrying NO personal data — only
-- the severed id, when, and how many rows went. Required to answer "was this
-- request honoured" 30 days later, which is exactly what a regulator asks.
CREATE TABLE IF NOT EXISTS erasure_log (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  rows_deleted JSONB   NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
