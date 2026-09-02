-- 104: one 5-day trial per person, not per account (the founder's ruling).
--
-- Keyed by PHONE DIGITS, deliberately not by user id: an account deletion
-- erases the user row, so a user-keyed record would hand the same person a
-- fresh trial every time they deleted and signed up again. The phone survives
-- that, which is the same reason phone_optouts is keyed this way (migration
-- 056).
--
-- Holds no personal data beyond the number itself and the moment the trial
-- started — nothing about what the person did.
CREATE TABLE IF NOT EXISTS stripe_trial_consumed (
  phone_digits TEXT PRIMARY KEY,
  consumed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The subscription the trial was granted on, for support questions.
  subscription_id TEXT
);
