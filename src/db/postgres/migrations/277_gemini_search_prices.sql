-- 277 (#7690): the price of a web search through Gemini with Google Search
-- grounding, and of a page read by our own fetch. Google bills each grounded
-- query (5,000 a month free on the paid tier, then USD 14 per 1,000; pricing
-- page, 25 Oct 2026) plus the model's tokens, about USD 0.001 per search with
-- the flash model. Booked at the paid rate, so the free allowance shows as
-- savings rather than a surprise.
INSERT INTO provider_prices (price_key, value) VALUES
  ('gemini.search',     0.015),
  ('direct.page_fetch', 0)
ON CONFLICT (price_key) DO NOTHING;
