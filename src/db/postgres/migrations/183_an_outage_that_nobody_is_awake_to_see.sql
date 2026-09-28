-- ⚠️ THE PRODUCT ANSWERED NOBODY FOR OVER FIVE HOURS AND FOUR PEOPLE SLEPT
-- THROUGH IT.
--
-- 28 September, 02:34:01. The provider began refusing every request — „You
-- have reached your specified API usage limits." Thirty-four goals across
-- seven people died, five of them real people including the founder's own
-- account, and every one of those goals had its next wake pushed a full day.
--
-- The server KNEW. `outage.sh` and the heartbeat both saw it within minutes,
-- from the server, with nobody's computer awake. What did not exist was any
-- way for the server to SAY SO to a person. The tester's seat found out at
-- 02:56 because it happened to be running; the founder found out in the
-- morning.
--
-- That is the 22 September lesson unlearned in a new place: on that day an
-- outage ran from 12:04 and was discovered at 12:55 from a screenshot. Fifty
-- minutes. This time it was five hours, and the only reason it was not nine is
-- that somebody happened to be testing at 2 a.m.
--
-- THE FOUNDER'S OWN WORDS, relayed 28 September 07:57: „I want that whatsapp
-- message sent to me, misho, giorgi and lika. to all of us". Misho asked for
-- the same thing directly, naming the same four.
--
-- ════════ WHY THIS IS A TABLE AND NOT A VARIABLE ════════
--
-- ⚠️ EVERY DEPLOY RESTARTS EVERY TIMER AND EMPTIES EVERY VARIABLE, and the
-- night this row is about proved it twice: five containers between 22:18 and
-- 23:00, lifetimes 16, 10, 7, 6 and 3 minutes, and the heartbeat — a
-- ten-minute `setInterval` — never fired once in any of them.
--
-- An alarm whose memory lives in the process would therefore either SHOUT
-- AGAIN on every deploy (thirty-four messages on a night like that one,
-- because I pushed thirteen times) or FORGET that it had shouted and go quiet.
-- Both are worse than no alarm, because both teach people to ignore it.
--
-- So the memory is here. A cause is an INCIDENT with a life: opened when it
-- starts, alerted once, cleared when it ends, and told once more when it does.
-- A restart reads the row and knows exactly where it stands.
--
-- Same reasoning as `sweep_runs` in 181 and the same fault behind both.
CREATE TABLE IF NOT EXISTS outage_incidents (
  id                  SERIAL      PRIMARY KEY,
  -- Which of the four the founder named: 'provider_refusing', 'api_down',
  -- 'login_codes', 'database'. Text and not an enum, because the next kind of
  -- breakage is not one we have thought of yet and a migration is a poor place
  -- to discover that.
  cause               TEXT        NOT NULL,
  -- The provider's OWN sentence where there is one, trimmed. „You have reached
  -- your specified API usage limits" and „the key is invalid" are different
  -- problems with different owners, and a count cannot tell them apart —
  -- that distinction is the whole reason this column exists.
  detail              TEXT        NOT NULL,
  -- How many people it reached, at the moment we noticed. Not recomputed
  -- later: what matters in the message is how bad it was when somebody could
  -- still act on it.
  people_affected     INTEGER     NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL means nobody has been told yet. This is what makes „one message per
  -- CAUSE, however many failures sit behind it" true across restarts.
  alerted_at          TIMESTAMPTZ,
  cleared_at          TIMESTAMPTZ,
  recovery_alerted_at TIMESTAMPTZ
);

-- ⚠️ ONE OPEN INCIDENT PER CAUSE, ENFORCED BY THE DATABASE AND NOT BY THE CODE
-- THAT WRITES IT.
--
-- The whole promise — one message per problem — rests on never opening a
-- second incident for a cause that is already open. A check in TypeScript
-- would hold until two containers overlapped during a deploy, which is the
-- exact minute an outage is most likely to be noticed. A partial unique index
-- cannot be raced.
--
-- Cleared incidents are deliberately NOT covered, so the same cause can happen
-- again next week and keep its own history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_outage_per_cause
  ON outage_incidents (cause)
  WHERE cleared_at IS NULL;

-- Reading „what is open right now" is the hot path — it runs on every sweep
-- and at every boot.
CREATE INDEX IF NOT EXISTS idx_outage_open
  ON outage_incidents (cleared_at, cause)
  WHERE cleared_at IS NULL;
