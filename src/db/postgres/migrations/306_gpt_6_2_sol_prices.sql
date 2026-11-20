-- Misho, 20 Nov: the final user-facing answer moves from GPT-6.1 Sol to
-- GPT-6.2 Sol (CHAT_FINAL_ANSWER_MODEL=gpt-6.2-sol).
--
-- These rows go in BEFORE the variable is switched, for the reason 149 gives:
-- a model with no price rows costs nothing in our books and debits nothing
-- from the user's wallet.
--
-- Rates from OpenAI's pricing page, standard API tier (20 Nov):
--   input $2.00 / cached input $0.10 / output $10.00 per million tokens.
-- cache_write is 0.00 as in 149 and 256, and it is never read: the usage we
-- record for an OpenAI call carries no cache-write count.
INSERT INTO provider_prices (price_key, value) VALUES
  ('openai.gpt-6.2-sol.input_mtok',       2.00),
  ('openai.gpt-6.2-sol.cache_read_mtok',  0.10),
  ('openai.gpt-6.2-sol.output_mtok',     10.00),
  ('openai.gpt-6.2-sol.cache_write_mtok', 0.00)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
