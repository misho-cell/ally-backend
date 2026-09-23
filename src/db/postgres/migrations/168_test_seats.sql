-- Ticket 20 row 251 — the tester creates their own fictional seats, and every
-- one of them is recorded here so nothing has to be taken on trust later.
--
-- WHY IT EXISTS. Row 251 needs a requester, a mediator and a target with NO
-- introduction ever asked between them. On 23 September every pair across the
-- eleven existing seats had one: 8 → 10 via 7, 9 → 7 via 8, 3 ↔ 6, 2 ↔ 4 via
-- 3, 3 → 1 via 2. The assistant refuses a second request on a used pair, which
-- is correct behaviour and left the row unprovable.
--
-- THE FOUNDER, 23 September (D464): „you need the permission from me and from
-- Misho to create test accounts because you are the main tester… I don't want
-- to wait for Misho every time we need it… I have approved it."
--
-- MISHO'S HALF, the same hour, to me directly, because the founder's own
-- sentence asks for both and a relayed quote is not the second half of a
-- permission the quote itself says needs two.
--
-- WHAT THIS TABLE IS FOR. The eleven original seats are a hardcoded Set in
-- `testSeatTokens.ts`, put in source on purpose so it „cannot be widened by
-- editing an environment variable". A route that creates seats cannot write
-- source, so the seats it makes are recorded here — and the difference from a
-- config value is the one that matters: a row can only get here by going
-- through the creation checks, which is what makes it safe to read back.
--
-- `phone` IS KEPT, not because anything looks it up by phone, but because the
-- one real hazard of a fictional account is its NUMBER. Netai Test 5 sits on a
-- number a real owner had had in their phonebook since August; a seat on a
-- number somebody real holds starts appearing in a real person's second
-- circle. The creation path refuses a number that exists anywhere, and this
-- column is the record of which one it took.
CREATE TABLE IF NOT EXISTS test_seats (
  user_id    INTEGER     PRIMARY KEY,
  name       TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  -- The admin account that asked for it. Never a real user's id.
  created_by TEXT        NOT NULL,
  -- Why, in words. The same requirement as the token route: no silent grants.
  note       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One seat per number, enforced by the database and not only by the check that
-- runs before the insert.
CREATE UNIQUE INDEX IF NOT EXISTS test_seats_phone ON test_seats (phone);
