-- The cost ledger looks prices up by the EXACT model string a call was made
-- with. Rates were seeded only under the dated id (claude-haiku-4-5-20251001),
-- so a call made with the alias logged "missing price ... recording cost 0".
-- Seed the alias keys too — same rates — so either spelling prices correctly.
INSERT INTO provider_prices (price_key, value) VALUES
  ('anthropic.claude-haiku-4-5.input_mtok',        1.00),
  ('anthropic.claude-haiku-4-5.output_mtok',       5.00),
  ('anthropic.claude-haiku-4-5.cache_write_mtok',  1.25),
  ('anthropic.claude-haiku-4-5.cache_read_mtok',   0.10)
ON CONFLICT (price_key) DO NOTHING;
