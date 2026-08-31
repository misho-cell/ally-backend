-- 100: the D35 shadow scan drives ITSELF to completion.
--
-- The scan was admin-triggered batch by batch, driven from an operator's
-- shell loop — which died with the operator's session container every time,
-- three times in two days, while covering ~13k of 171k owners. The writes
-- were always idempotent and paced; only the trigger was fragile. This row
-- is the server's own resume point: a cron ticks one batch at a time until
-- done, survives deploys, and stops itself at the end.
CREATE TABLE IF NOT EXISTS identity_scan_progress (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_from  INTEGER NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with where the shell driver actually got to (31 Aug 08:35 UTC), so
-- nothing is re-walked. Idempotent inserts make an overlap harmless anyway.
INSERT INTO identity_scan_progress (id, next_from) VALUES (1, 13001)
ON CONFLICT (id) DO NOTHING;
