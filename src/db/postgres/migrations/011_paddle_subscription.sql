ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS subscription_tier      VARCHAR(20)  NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(20)  NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS paddle_customer_id     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ;
