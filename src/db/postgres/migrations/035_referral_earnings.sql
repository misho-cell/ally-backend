-- Referral earnings: 5% of a referred user's FIRST real subscription charge is
-- split into 6 equal shares and paid up the inviter chain (one share per
-- level; missing levels are not redistributed). Shares are truncated to 2
-- decimals. Balances accumulate in USD and can be spent on token packages or
-- a subscription month, or withdrawn from $10 (withdrawal flow ships later).

CREATE TABLE IF NOT EXISTS referral_transactions (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,           -- beneficiary (or spender)
  amount_usd     NUMERIC(12,2) NOT NULL,  -- positive = earn, negative = spend/withdraw
  reason         TEXT NOT NULL,           -- earn | spend_tokens | spend_subscription | withdrawal
  level          INTEGER,                 -- 1..6 for earns
  source_user_id TEXT,                    -- the subscriber whose payment generated the earn
  external_id    TEXT,                    -- paddle txn id for earns; generated id for spends
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook retries must not double-pay: one row per beneficiary per source txn.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_txn_dedupe
  ON referral_transactions (user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_txn_user
  ON referral_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_txn_source
  ON referral_transactions (source_user_id) WHERE reason = 'earn';

-- Program parameters — editable in DB, no deploy needed.
INSERT INTO provider_prices (price_key, value) VALUES
  ('referral.percent',            5),
  ('referral.levels',             6),
  ('referral.min_withdrawal_usd', 10),
  ('subscription.price.pro',        19.99),
  ('subscription.price.enterprise', 79.00)
ON CONFLICT (price_key) DO NOTHING;

-- Spending referral balance on token packages needs the package's USD price
-- as data (it previously lived only in the label text).
ALTER TABLE topup_packages ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10,2);
UPDATE topup_packages SET price_usd = 10.99 WHERE tokens = 500  AND price_usd IS NULL;
UPDATE topup_packages SET price_usd = 19.99 WHERE tokens = 1000 AND price_usd IS NULL;
UPDATE topup_packages SET price_usd = 44.99 WHERE tokens = 2500 AND price_usd IS NULL;
