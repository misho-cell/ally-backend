-- Row 232, second pass — the status I wrote did not exist, and my own log line
-- is what said so.
--
-- `cancelIntroductionRequestsForTask` shipped at 15:34 writing
-- `status = 'cancelled'`. At 15:38:20 the seat stopped goal 7327 and the
-- request stayed pending. Their two hypotheses were that the request carried
-- no task link, and that the deploy was not live; both are wrong —
-- `requester_task_id` is 7327 on row 1354, and the build logged „Server
-- listening" at 15:34:23, four minutes before the stop.
--
-- The truth was in the deployment log, from the best-effort catch I put around
-- that update precisely so a failure could not fail a stop:
--
--   [db failed] UPDATE introduction_requests SET status = 'cancelled' …
--   [intro] could not withdraw requests for stopped goal 7327:
--     new row for relation "introduction_requests" violates check constraint
--
-- `introduction_requests_status_check` allows pending | accepted | declined
-- and nothing else. I added a fourth state to the code and not to the table,
-- and I did not read the constraint before writing the value.
--
-- „declined" was the wrong way out and was not taken: it would say the
-- mediator refused, and they did not — the requester withdrew. A withdrawal
-- and a refusal are different facts about a real person's behaviour, and the
-- whole point of this row is that the mediator is treated honestly.
ALTER TABLE introduction_requests
  DROP CONSTRAINT IF EXISTS introduction_requests_status_check;

ALTER TABLE introduction_requests
  ADD CONSTRAINT introduction_requests_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text]));

COMMENT ON COLUMN introduction_requests.status IS
  'pending | accepted | declined | cancelled. „cancelled" is the REQUESTER '
  'withdrawing (their goal was stopped) — never the mediator refusing, which '
  'is „declined" (row 232).';
