-- Ticket 19 (the founder, 13 Sep: „yes, the 62,000 old-Ally accounts are
-- targets. Build it.").
--
-- Until now a person could enter the invite pool only if two Netai users had
-- their number saved. That is our phonebooks looking at themselves. The 62,000
-- accounts that registered with old Ally and never opened Netai are ours
-- already — we hold the account and the number — and if nobody happens to carry
-- them in a phone, the engine could not see them at all.
--
-- Why a table and not a wider live query. The list build already takes about
-- two minutes on a thousand candidates; sixty-two thousand in the same shape is
-- hours, on a route that dies at sixty seconds. So the whole base is walked
-- SLOWLY, in the background, and the live build only ever reads the top of what
-- that walk left behind. The founder approved exactly this shape.
--
-- What a row means: this account exists, has never opened Netai, and these are
-- its own signals. Whether it is a good target is the scorer's business, not
-- this table's.
CREATE TABLE IF NOT EXISTS base_pool_candidates (
  phone          TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  -- Counted with a cap, like every other phonebook count here: the number is
  -- „at least this", never a full scan of a 25,000-row import.
  own_contacts   INTEGER NOT NULL,
  registered_at  TIMESTAMPTZ,
  -- Kept even when true so the walk does not rediscover the same accounts
  -- every night; the read filters them out.
  opened_netai   BOOLEAN NOT NULL DEFAULT FALSE,
  refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The one read the live build makes: the biggest phonebooks that never opened
-- Netai, newest walk first.
CREATE INDEX IF NOT EXISTS idx_base_pool_open
  ON base_pool_candidates (opened_netai, own_contacts DESC);

-- Where the nightly walk got to, so it resumes instead of starting over. One
-- row, ever.
CREATE TABLE IF NOT EXISTS base_pool_cursor (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_user_id INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO base_pool_cursor (id, last_user_id) VALUES (TRUE, 0)
ON CONFLICT (id) DO NOTHING;
