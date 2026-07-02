-- Token top-up packages (phase 3): one-time Paddle purchases that credit the
-- wallet. A package maps a Paddle price id to a token amount; the checkout is
-- opened by the app with that price id, and transaction.completed credits it.
CREATE TABLE IF NOT EXISTS topup_packages (
  id              SERIAL PRIMARY KEY,
  paddle_price_id TEXT NOT NULL UNIQUE,
  tokens          INTEGER NOT NULL,
  label           TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No seed rows: create the one-time price in the Paddle dashboard first, then
-- INSERT INTO topup_packages (paddle_price_id, tokens, label) VALUES ('pri_...', 500, '500 ტოკენი');

-- Paddle retries webhooks — the transaction id makes crediting idempotent.
ALTER TABLE token_transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_external
  ON token_transactions (external_id)
  WHERE external_id IS NOT NULL;
