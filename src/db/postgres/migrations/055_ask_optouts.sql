-- 055: person-level opt-out from incoming asks (ticket 4, item 00).
-- On 11 Aug a recipient wrote "do not write to me again", her assistant agreed
-- ("I will not trouble you again"), and a new ask from the same sender reached
-- her minutes later: the refusal was scoped to one task, and nothing enforced
-- it at send time. A refusal is about the PERSON, not the errand — this table
-- is the enforcement point, read by createAsk before any ask is created.
CREATE TABLE IF NOT EXISTS ask_optouts (
  user_id    INTEGER PRIMARY KEY,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Who opted out, for the audit trail the ticket asks for (T2-02): a row is
-- removed when the person lifts it, so the log keeps the history.
CREATE TABLE IF NOT EXISTS ask_optout_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('opt_out', 'resume')),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_optout_events_user ON ask_optout_events (user_id, created_at DESC);
