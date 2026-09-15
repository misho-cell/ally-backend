-- The tester's channel, inside our own admin panel.
--
-- WHY THIS EXISTS. Tickets reach us as files that Misho copies by hand, in
-- both directions, every time. The backend and frontend sessions now talk
-- directly, but the tester is on a different Claude account and cross-account
-- session messaging is refused by design — which is correct, and not something
-- to route around. So the meeting point is the one place both sides already
-- have: the admin panel.
--
-- WHAT A ROW IS. One message in one shared thread. Not a chat between two
-- named people: whoever is looking at the panel can read the whole exchange,
-- which is the point — Misho stops being the wire and stays the reader.
CREATE TABLE IF NOT EXISTS handoff_messages (
  id          SERIAL PRIMARY KEY,
  -- Who this message is FROM, in the reader's terms. Explicit and never
  -- inferred: I post through Misho's admin login, so without this every line I
  -- write would appear under his name. A product must not say a person wrote
  -- what a machine wrote.
  author      TEXT NOT NULL,
  -- Which login actually made the request. The row therefore carries both what
  -- the message claims to be and what the server saw, so a mislabelled author
  -- is visible afterwards instead of being the last word.
  posted_by   TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_messages_time ON handoff_messages (id DESC);

-- How far each side has read.
--
-- Per READER, not per message: two people and two assistants look at the same
-- thread, and „has this been read" has a different answer for each of them. A
-- read flag on the message itself would have to pick one of them and be wrong
-- for the rest.
CREATE TABLE IF NOT EXISTS handoff_reads (
  reader       TEXT PRIMARY KEY,
  last_seen_id INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
