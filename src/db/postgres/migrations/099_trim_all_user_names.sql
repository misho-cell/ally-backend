-- 099: Ticket 8 Task 12, round three of trailing spaces — 84480
-- ("Nika Turashvili "), 88076 ("Nika Turashvilin236@gmail.com "), and 8044
-- ("Gabriel Turashvili ") each carry one. 089 fixed one row by id; chasing
-- them one at a time is the wrong shape — trim EVERY stored name once, and
-- registration now trims at the door so a fourth never appears.
UPDATE "User" SET name = TRIM(name) WHERE name IS NOT NULL AND name <> TRIM(name);
