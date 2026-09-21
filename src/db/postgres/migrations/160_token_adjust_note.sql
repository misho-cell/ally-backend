-- §19 — why a token grant happened, stored beside the grant.
--
-- The four `admin_adjust` rows already in this table were written by hand in
-- July: 999,999 to one account, 100,000 to another, 1,000 each to two more.
-- Every one of them carries no external_id and no reason beyond the word
-- „admin_adjust", so „who topped that up, and what for" has no answer anywhere
-- except somebody's memory of July.
--
-- The route registered in §19 requires a note. This is where it goes, so the
-- answer lives next to the row instead of in a person.
--
-- Nullable, because the four July rows exist and backfilling a reason nobody
-- recorded would be inventing one.
ALTER TABLE token_transactions
  ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN token_transactions.note IS
  'Why an admin adjustment was made (§19). Required by the route, NULL on the '
  'four rows written by hand in July before the route existed.';
