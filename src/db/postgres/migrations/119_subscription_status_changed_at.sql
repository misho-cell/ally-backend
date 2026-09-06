-- 119: when the subscription status last changed.
--
-- The founder's ruling on a failed payment (2 Sep) was that the person should
-- get to try again: Stripe retries the card on its own schedule and the portal
-- lets them fix it, and cutting access off mid-retry punishes an expired card
-- as if it were a cancellation.
--
-- stripe.service.ts has honoured that from the start — `past_due` counts as a
-- paying status there. The gate that actually decides who may use the product,
-- requireSubscription, never did: it let `trialing` and `active` through and
-- refused everything else, so the ruling had no effect on a single request.
--
-- Granting `past_due` access needs a clock, or a subscription left past_due
-- forever is free access forever. The subscription's own period end is no use:
-- Stripe rolls it forward at renewal, so a card that fails on renewal day
-- carries a period end a month into the future. This column is the honest
-- anchor — the moment WE learnt the status changed — and the grace window is
-- measured from it.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS subscription_status_changed_at TIMESTAMPTZ;

-- Deliberately not backfilled. NULL means "we never saw this status change",
-- and the middleware reads that as no grace rather than as a fresh failure —
-- an unknown-age past_due must not open the door on a guess. Nobody is on the
-- Stripe price yet, so no live account is affected by leaving it empty.
