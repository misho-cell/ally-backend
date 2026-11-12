-- The rates of the models every route moved to on 11 Nov (aiModels.ts).
--
-- That move shipped without these rows. getPrice returns 0 for a key it cannot
-- find, so from then on every call was booked at $0. Three things followed:
-- the company's own books showed no spend, users' wallets were not charged,
-- and the test seats' $50-a-day guard (testSeatWakes.ts) read $0 and could
-- never trip. Rates from the Claude pricing page, 12 November 2026.
--
--                    Sonnet 5.5   Haiku 5.5
--   input              $2.00       $0.10
--   output            $10.00       $0.50
--   cache read         $0.10       $0.01
--   cache write        $2.50       $0.125
--
-- Haiku 5.5's rates are for prompts up to 100K tokens; above that it costs
-- $0.50 / $2.50, which our short calls do not reach.
INSERT INTO provider_prices (price_key, value) VALUES
  ('anthropic.claude-sonnet-5-5.input_mtok',        2.00),
  ('anthropic.claude-sonnet-5-5.output_mtok',      10.00),
  ('anthropic.claude-sonnet-5-5.cache_read_mtok',   0.10),
  ('anthropic.claude-sonnet-5-5.cache_write_mtok',  2.50),
  ('anthropic.claude-haiku-5-5.input_mtok',         0.10),
  ('anthropic.claude-haiku-5-5.output_mtok',        0.50),
  ('anthropic.claude-haiku-5-5.cache_read_mtok',    0.01),
  ('anthropic.claude-haiku-5-5.cache_write_mtok',   0.125)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
