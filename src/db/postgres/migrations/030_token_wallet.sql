-- Token wallet (phase 2 of the cost/token system): user balances are the sum
-- of signed transactions — grants on subscription periods, debits per chat run.
-- Fully auditable: every debit references the run whose ledger cost it covers.

CREATE TABLE IF NOT EXISTS token_transactions (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  amount     INTEGER NOT NULL,          -- positive = grant/topup, negative = debit
  reason     TEXT NOT NULL,             -- monthly_grant | trial_grant | chat_debit | topup | admin_adjust
  period_key TEXT,                      -- 'm:YYYY-MM' for monthly grants, 'trial' for the one-time trial grant
  run_id     TEXT,                      -- chat run this debit covers
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user ON token_transactions (user_id, created_at DESC);

-- One grant per user per period, race-safe under concurrent balance checks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_period
  ON token_transactions (user_id, period_key)
  WHERE period_key IS NOT NULL;

-- Wallet parameters (editable from DB, no deploy):
--   tokens.usd_per_token — internal cost budget one token represents
--   tokens.monthly_grant — tokens granted to an active subscriber per month ($10.00)
--   tokens.trial_grant   — one-time tokens for a trialing user ($1.20 of the $1.50 all-in trial budget;
--                          the remaining $0.30 is reserved for OTP/background spend)
INSERT INTO provider_prices (price_key, value) VALUES
  ('tokens.usd_per_token', 0.01),
  ('tokens.monthly_grant', 1000),
  ('tokens.trial_grant',   120)
ON CONFLICT (price_key) DO NOTHING;

-- Enforcement kill-switch: off by default so the deploy changes nothing until
-- the flag is flipped. UPDATE app_flags SET enabled = true WHERE flag = 'token_wallet';
INSERT INTO app_flags (flag, enabled)
VALUES ('token_wallet', false)
ON CONFLICT (flag) DO NOTHING;
