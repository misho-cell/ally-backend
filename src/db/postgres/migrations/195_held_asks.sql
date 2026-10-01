-- The tester's 983: an approved plan's question to Test 48 was refused by the
-- recipient's 24-hour limit; the goal woke at the reopening (tester 929) but
-- the run did not know WHICH question was waiting, guessed („ალბათ") whether
-- the window had reopened, and asked the owner to confirm again — against
-- D119 (the approval is the consent) and its own promise.
--
-- A question held ONLY by that limit is recorded here. It has already passed
-- every consent gate (the limit is checked after them), so at the wake the
-- server tells the run exactly what is waiting and that it may send it.
CREATE TABLE IF NOT EXISTS held_asks (
  id            SERIAL      PRIMARY KEY,
  task_id       INTEGER     NOT NULL,
  to_user_id    INTEGER     NOT NULL,
  contact_name  TEXT        NOT NULL,
  question      TEXT        NOT NULL,
  reopens_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When the run was told about it, or the question went another way.
  released_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS held_asks_waiting ON held_asks (task_id) WHERE released_at IS NULL;
