-- Ticket 20 row 129: the final user-facing answer may be written by OpenAI.
--
-- THESE ROWS GO IN BEFORE THE MODEL IS SWITCHED, NOT AFTER. getPrice returns 0
-- for a key it cannot find — it warns to the log and carries on — and
-- debitRun then reads `if (costUsd <= 0) return 0`. A model with no price rows
-- therefore costs nothing in our books AND debits nothing from the user's
-- wallet, silently, for as long as nobody reads the warning.
--
-- Rates from the OpenAI pricing page, 16 September 2026, GPT-5.6 Terra:
--   input $2.00 / cached input $0.20 / output $12.00 per million tokens.
--
-- cache_write is 0.00 and that is a FACT about OpenAI, not a placeholder:
-- there is no charge for writing a prompt into the cache, which is why the
-- hybrid is worth costing at all — cache writes are 66% of our Anthropic bill.
-- It is written explicitly so the row exists and the missing-price warning
-- stays meaningful for keys that are genuinely absent.
INSERT INTO provider_prices (price_key, value) VALUES
  ('openai.gpt-5.6-terra.input_mtok',       2.00),
  ('openai.gpt-5.6-terra.cache_read_mtok',  0.20),
  ('openai.gpt-5.6-terra.output_mtok',     12.00),
  ('openai.gpt-5.6-terra.cache_write_mtok', 0.00)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
