-- Row 275 / §59 — 'expired' is a status the table refused to hold.
--
-- ⚠️ AND I HAD CHECKED FOR THIS AND READ MY OWN ANSWER WRONG. Before building
-- the expiry I asked `information_schema` whether `status` carried a check
-- constraint. It came back NULL, and I read null as „there is no constraint".
-- Null meant the query I had written could not see one: the join through
-- `constraint_column_usage` does not reach a CHECK the way I assumed.
--
-- „I could not look" read as „I looked and found nothing" — the exact
-- confusion this codebase's ops scripts exist to prevent, made by the person
-- who put the exit codes in them. `pg_get_constraintdef` says it plainly:
--
--   CHECK (status = ANY (ARRAY['pending','accepted','declined','cancelled']))
--
-- The cost was one refused write. The sweep failed, the transaction rolled
-- back, all sixteen rows stayed 'pending' and nobody was told anything — which
-- is the one direction a money-or-people write is allowed to fail in, and the
-- reason `confirm` exists at all.

ALTER TABLE introduction_requests
  DROP CONSTRAINT IF EXISTS introduction_requests_status_check;

ALTER TABLE introduction_requests
  ADD CONSTRAINT introduction_requests_status_check
  CHECK (status = ANY (ARRAY['pending', 'accepted', 'declined', 'cancelled', 'expired']));

COMMENT ON CONSTRAINT introduction_requests_status_check ON introduction_requests IS
  'D496: a request nobody answered for 14 days expires. The asker is told and '
  'may ask again; the helper is never chased and sees "expired" if they look.';
