-- 120: invite cohorts — a registration door that carries its own free period.
--
-- Ticket 10 Task 26 (the founder's vision document of 7 September, N07; D125):
-- the Axel launch cohort gets 20 free days instead of the 5-day trial, the
-- plans and prices show when the period ends, and every other code keeps 5.
--
-- A cohort is a CODE the founder hands out — in a link or read aloud at the
-- Axel evening — with the number of free days it carries. Registering through
-- it opens the account already trialing for that many days, no card asked;
-- when the period ends the ordinary paywall shows, and the Stripe checkout
-- then gives NO further trial (the phone is written into stripe_trial_consumed
-- at the door, the same one-trial-per-person rule as everywhere else).
--
-- Codes are chosen by a human and kept in upper case. A user's own referral
-- code is eight letters from an alphabet without 0, O, 1, I or L, so a cohort
-- code that contains one of those can never collide with it; the lookup asks
-- this table first regardless, because a cohort is an invitation from the
-- company and outranks a personal referral.
CREATE TABLE IF NOT EXISTS invite_cohorts (
  code        TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  trial_days  INTEGER     NOT NULL CHECK (trial_days BETWEEN 1 AND 90),
  tier        TEXT        NOT NULL DEFAULT 'pro',
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  note        TEXT,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which door the account came in through — the day-20 and day-40 lists for
-- the founder's calls (D125) are "everyone in this cohort", and nothing else
-- in the schema could answer that.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS invite_cohort TEXT;
CREATE INDEX IF NOT EXISTS idx_user_invite_cohort ON "User" (invite_cohort)
  WHERE invite_cohort IS NOT NULL;
