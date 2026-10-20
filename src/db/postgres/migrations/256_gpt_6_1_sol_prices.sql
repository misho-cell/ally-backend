-- Misho, 20 Oct: the final user-facing answer moves from GPT-5.6 Terra to
-- GPT-6.1 Sol (CHAT_FINAL_ANSWER_MODEL=gpt-6.1-sol).
--
-- These rows go in BEFORE the variable is switched, for the reason 149 gives:
-- a model with no price rows costs nothing in our books and debits nothing
-- from the user's wallet.
--
-- Rates from OpenAI's GPT-6.1 Sol launch post, standard API tier:
--   input $2.00 / cached input $0.10 / output $10.00 per million tokens.
-- cache_write is 0.00 as in 149, and it is never read: the usage we record for
-- an OpenAI call carries no cache-write count (finalAnswer.service sets it to 0).
INSERT INTO provider_prices (price_key, value) VALUES
  ('openai.gpt-6.1-sol.input_mtok',       2.00),
  ('openai.gpt-6.1-sol.cache_read_mtok',  0.10),
  ('openai.gpt-6.1-sol.output_mtok',     10.00),
  ('openai.gpt-6.1-sol.cache_write_mtok', 0.00)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
