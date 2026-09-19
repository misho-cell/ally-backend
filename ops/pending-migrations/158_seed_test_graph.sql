-- Seed the test accounts' contact graph — CHAIN ONE ONLY.
--
-- NOT APPLIED. This file lives in ops/pending-migrations on purpose: anything
-- in src/db/postgres/migrations runs automatically at the next boot, and this
-- is a write to live rows. Moving it into that directory IS the act that needs
-- Misho's word. Until then it is text to read.
--
-- WHY A MIGRATION RATHER THAN THE TOOL THAT WAS ASKED FOR. The seat asked for
-- a seeding tool in prompt.sh's shape — an allowlist, a change file, check,
-- apply, undo. That shape needs a write route to "UserAlias", and none exists;
-- building one would add a live contacts-write capability for a job that is
-- run once. A migration gives the part that actually matters — the exact rows
-- are in git and a person reads them before they exist — without the
-- capability. If re-seeding between test runs turns out to be needed, that is
-- when the route earns itself, with evidence rather than in advance.
--
-- THE RULE THE SHAPE COMES FROM, and it is the seat's: the MISSING edges are
-- the test. Seed everybody with everybody and no introduction is ever
-- necessary, which quietly deletes rows 210, 211, 125 and 205 in one stroke.
--
--   A  171870  asker          holds  B, D, E      NOT C   <- the experiment
--   B  171871  first bridge   holds  A, C
--   C  171872  target         holds  B, D         NOT A
--   D  171873  second bridge  holds  A, C, E
--   E  171936  stranger       holds  A, D
--
-- A has two routes to C, through B and through D. That is the only thing in
-- the set that can exercise "one approval, exactly one message" (row 205).
--
-- E IS 171936 AND NOT 171874. Test 5 was condemned: its number has been in a
-- real owner's phonebook since 22 August. It is not in the ten and nothing is
-- ever pointed at it.
--
-- NO PHONE NUMBER IS WRITTEN HERE. Each is derived from "UserPhone" by account
-- id, so the seed cannot attach the wrong number to the wrong account, and
-- D149 holds. Twelve edges, not the eleven an earlier note said — recounted
-- from the table above.
--
-- UNDO, exact and total, because all ten had zero alias rows before this:
--   DELETE FROM "UserAlias"
--    WHERE "contactId" IN (171870,171871,171872,171873,171936);
INSERT INTO "UserAlias" ("contactId", phone, alias, source)
SELECT e.owner_id, p.phone, u.name, 'test_seed'
FROM (VALUES
  (171870, 171871), (171870, 171873), (171870, 171936),
  (171871, 171870), (171871, 171872),
  (171872, 171871), (171872, 171873),
  (171873, 171870), (171873, 171872), (171873, 171936),
  (171936, 171870), (171936, 171873)
) AS e(owner_id, contact_user_id)
JOIN "UserPhone" p ON p."userId" = e.contact_user_id
JOIN "User" u      ON u.id      = e.contact_user_id
WHERE NOT EXISTS (
  SELECT 1 FROM "UserAlias" a
  WHERE a."contactId" = e.owner_id AND a.phone = p.phone
);
