-- 089: Ticket 7 task 8 item 3 — user 118509's stored name is
-- "Giorgi Turashvili " (trailing space, verified via RO-SQL on 27 Aug:
-- LENGTH 18 vs the other two accounts' 17). The space rendered as
-- "**Giorgi Turashvili **" in recipient-side markdown. One-row fix,
-- ordered by the tester's ticket; idempotent.
UPDATE "User" SET name = TRIM(name) WHERE id = 118509 AND name <> TRIM(name);
