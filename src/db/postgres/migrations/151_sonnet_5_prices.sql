-- Ticket 20 row 151: Sonnet 5's rates, in before the model moves to it.
--
-- Misho's decision of 16 September. Sonnet 5 is a NEWER model and cheaper than
-- the Sonnet 4.6 we were running, on every one of the four lines:
--
--                  4.6      5
--   input         $3.00   $2.00
--   output       $15.00  $10.00
--   cache read    $0.30   $0.20
--   cache write   $3.75   $2.50
--
-- On our own fourteen-day volumes that is roughly $75/week down to $50, and
-- cache write is the line that matters most because it is two thirds of the
-- bill (see row 130).
--
-- These rows go in the SAME commit as the model change, never after. getPrice
-- returns 0 for a key it cannot find and debitRun skips a zero-cost run, so a
-- model switched on without its rates bills the company nothing in its own
-- books AND takes nothing from users' wallets, silently, for as long as it
-- runs. Rates from the Claude pricing page, 16 September 2026.
INSERT INTO provider_prices (price_key, value) VALUES
  ('anthropic.claude-sonnet-5.input_mtok',        2.00),
  ('anthropic.claude-sonnet-5.output_mtok',      10.00),
  ('anthropic.claude-sonnet-5.cache_read_mtok',   0.20),
  ('anthropic.claude-sonnet-5.cache_write_mtok',  2.50)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
