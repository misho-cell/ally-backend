-- Cost ledger: every external spend (Claude tokens, Tavily searches, OTP
-- messages) recorded per user/run so real per-user cost and margin can be
-- computed. Prices live in provider_prices so rate changes are a DB update,
-- not a deploy.

CREATE TABLE IF NOT EXISTS usage_events (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT,               -- NULL for internal/unattributed spend
  kind                  TEXT NOT NULL,      -- chat | moderation | notification | fact_extraction | enrichment | admin_chat | web_search | otp_whatsapp | otp_sms
  provider              TEXT NOT NULL,      -- anthropic | tavily | whatsapp | twilio
  model                 TEXT,               -- for anthropic events
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens     INTEGER,
  units                 NUMERIC(10,2),      -- for fixed-price events (searches, messages)
  cost_usd              NUMERIC(12,6) NOT NULL,
  run_id                TEXT,
  thread_id             INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_time ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_time      ON usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_run       ON usage_events (run_id);

CREATE TABLE IF NOT EXISTS provider_prices (
  price_key  TEXT PRIMARY KEY,
  value      NUMERIC(14,8) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed current rates. Token rates are USD per million tokens; message/search
-- rates are USD per unit; infra.overhead_pct is a percentage applied on top of
-- variable costs to amortize hosting. Verify message rates against invoices.
INSERT INTO provider_prices (price_key, value) VALUES
  ('anthropic.claude-sonnet-4-6.input_mtok',                3.00),
  ('anthropic.claude-sonnet-4-6.output_mtok',              15.00),
  ('anthropic.claude-sonnet-4-6.cache_write_mtok',          3.75),
  ('anthropic.claude-sonnet-4-6.cache_read_mtok',           0.30),
  ('anthropic.claude-haiku-4-5-20251001.input_mtok',        1.00),
  ('anthropic.claude-haiku-4-5-20251001.output_mtok',       5.00),
  ('anthropic.claude-haiku-4-5-20251001.cache_write_mtok',  1.25),
  ('anthropic.claude-haiku-4-5-20251001.cache_read_mtok',   0.10),
  ('tavily.search',                                         0.008),
  ('whatsapp.otp_message',                                  0.05),
  ('twilio.sms',                                            0.10),
  ('infra.overhead_pct',                                   10.00)
ON CONFLICT (price_key) DO NOTHING;
