-- Row 228 (the seat's 394, Pr1) — a user who cancelled looks exactly like a
-- user who will be charged.
--
-- 21 September, account 4511, a real card and a real Stripe subscription.
-- 11:26 the payment ran clean: $19.99/month, five days free, nothing charged.
-- Then „Cancel subscription" on Stripe's own page, which then reads „cancels
-- 26 Sept". At 12:35 UTC the Netai record still read:
--
--   subscription_tier      premium
--   subscription_status    trialing
--   trial_ends_at          2026-09-26T11:26:51Z
--   current_period_ends_at 2026-09-26T11:26:51Z
--
-- Byte for byte what it read before the cancellation, and the profile still
-- said the payment was automatic.
--
-- THE EVENT WAS NEVER MISSING. `customer.subscription.updated` has been
-- handled since the webhook was written, and `applySubscription` runs on it.
-- What that function reads is status, tier, trial end and period end — and a
-- cancel-at-period-end changes NONE of those. Stripe keeps the status as
-- `trialing` or `active` and raises `cancel_at_period_end` instead. So the
-- write happened, wrote the same four values back, and the one fact that
-- differed had nowhere to land.
--
-- That is why this is a column and not a bug fix in a handler: the handler was
-- doing what it was told, and nothing in the schema could hold the answer.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancels_at TIMESTAMPTZ;

COMMENT ON COLUMN "User".cancel_at_period_end IS
  'Stripe cancel_at_period_end: the subscription runs to the end of the paid '
  'period and then stops. Status stays trialing/active, which is why this '
  'needs its own column (row 228).';
COMMENT ON COLUMN "User".cancels_at IS
  'When it actually stops, from Stripe cancel_at — the date to show instead of '
  'a renewal date.';
