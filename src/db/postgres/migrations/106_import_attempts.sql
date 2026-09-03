-- 106: every phonebook import leaves a row. (Ticket 9 task 24, question 2 —
-- "which accounts imported contacts between the upgrade and the fix, and what
-- happens to them", owed since 21 August.)
--
-- The honest answer today is "we cannot tell": the import endpoint was broken
-- from its 5 August rewrite until 21 August, and nothing anywhere recorded
-- that an import was even attempted. What is left is inference from absence —
-- 52 of the 136 accounts registered since 1 June hold no real contact, and
-- nothing in the data separates "tried and every row failed" from "never
-- granted the permission".
--
-- The alarm added in August fires on a zero-row import, but a log line is not
-- a record: it ages out, and it cannot be joined to an account later. This
-- table is the record, so the next time the question is asked it has an answer
-- instead of an inference.
CREATE TABLE IF NOT EXISTS import_attempts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL,
  source      TEXT        NOT NULL,
  requested   INTEGER     NOT NULL,
  imported    INTEGER     NOT NULL,
  skipped     INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_attempts_user ON import_attempts (user_id, created_at DESC);
-- The read that matters is "show me the failures", so it gets its own index.
CREATE INDEX IF NOT EXISTS idx_import_attempts_failed
  ON import_attempts (created_at DESC)
  WHERE imported = 0;
