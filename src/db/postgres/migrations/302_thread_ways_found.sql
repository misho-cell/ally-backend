-- 302: Misho's yes, 8 Nov (ops 18:45Z item 2). The people a search showed as a way
-- in, kept per conversation, so a plan may name someone an earlier run of the same
-- goal found (the guard used to remember only the current run).
CREATE TABLE IF NOT EXISTS thread_ways_found (
  thread_id    INTEGER     NOT NULL,
  phone_digits TEXT        NOT NULL,
  found_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, phone_digits)
);
CREATE INDEX IF NOT EXISTS idx_thread_ways_found_at ON thread_ways_found (found_at);
