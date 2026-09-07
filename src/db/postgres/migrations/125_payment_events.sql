-- 125: the payment history (Ticket 10 Task 28 (b); D127, 7 Sep).
--
-- The founder wants each user's first three payment dates on the dashboard.
-- Until now no payment was ever written down here: Stripe's invoice.paid and
-- Paddle's transaction.completed moved the subscription status and nothing
-- else, so „when did this person first pay" had no answer in our data.
--
-- One row per money movement, keyed by the provider's own id so a webhook
-- retry cannot count a payment twice. A $0 trial invoice is not a payment
-- and is never written.
CREATE TABLE IF NOT EXISTS payment_events (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  provider    TEXT    NOT NULL CHECK (provider IN ('stripe', 'paddle')),
  external_id TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('subscription', 'topup')),
  amount_usd  NUMERIC(10, 2) NOT NULL,
  currency    TEXT    NOT NULL,
  paid_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_events_user ON payment_events (user_id, paid_at);
