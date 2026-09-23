-- The eleven original fictional seats join the ones the route made, so SQL has
-- ONE list to ask instead of two half-lists in two languages.
--
-- Misho's word, 23 September: „you can run the query yourself — run it."
--
-- WHY IT IS NEEDED. Since `POST /admin/test-accounts` shipped there have been
-- two sources of „is this account fictional": a hardcoded Set in
-- `testSeatTokens.ts`, which SQL cannot see, and `test_seats`, which holds only
-- the seats the route created. That split is mine, and it is why keeping
-- fictional accounts out of a population read costs a parameter in every query
-- instead of one clause.
--
-- WHAT IT COST ALREADY, measured the same afternoon:
--
--     accounts with an ACTIVE subscription        41
--       of them fictional seats                   20     ← 49%
--
-- Every count and ranking built on „active" was half fiction, and the fix had
-- to be written twice over — once against the Set, once against the table.
--
-- ────────────────────────────────────────────────────────────────────────
-- THE IDS ARE WRITTEN OUT ONE BY ONE AND NOT AS A RANGE, AND THAT IS THE WHOLE
-- CARE IN THIS FILE.
--
-- „171870 to 171941" reads as the eleven and CONTAINS 171903 — a real person's
-- account, a Georgian name on a +995 number, inside the range only because of
-- when it was created. A backfill on the range would have filed a human being
-- as a fictional test seat, and every later read of this table would have
-- believed it.
--
-- I used that range in a measurement earlier the same day and caught it only
-- by going to look at the two phonebook rows it produced. An id range is not a
-- fact about a person; neither is a name, and neither is a phone prefix.
-- ────────────────────────────────────────────────────────────────────────
--
-- The name and the number are READ FROM THE LIVE ROWS rather than typed here:
-- a list of numbers copied into a migration is a second place for them to be
-- wrong, and this table's `phone` exists precisely so the one fact that can
-- hurt somebody is recorded rather than assumed.
--
-- `ON CONFLICT DO NOTHING` with no target, so a re-run is a no-op whichever of
-- the two unique constraints it would meet.
INSERT INTO test_seats (user_id, name, phone, created_by, note)
SELECT DISTINCT ON (u.id)
       u.id,
       u.name,
       up.phone,
       'source list',
       'One of the eleven original fictional seats, backfilled 23 September so SQL has a single list.'
FROM "User" u
JOIN "UserPhone" up ON up."userId" = u.id
WHERE u.id IN (171870, 171871, 171872, 171873, 171874,
               171936, 171937, 171938, 171939, 171940, 171941)
ORDER BY u.id, up.id
ON CONFLICT DO NOTHING;
