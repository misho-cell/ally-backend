-- 129: the founder's weekly numbers (D133, 8 Sep): the weekly token grant is
-- a quarter of the monthly one — 250 for Pro and Premium, 1,375 for
-- Enterprise — under the price keys the weekly window reads (D124). The
-- window itself is switched by BUDGET_WINDOW=week on the service; until then
-- these rows are read by nothing. Editable in provider_prices, no deploy.
INSERT INTO provider_prices (price_key, value) VALUES
  ('tokens.weekly_grant',            250),
  ('tokens.weekly_grant.pro',        250),
  ('tokens.weekly_grant.premium',    250),
  ('tokens.weekly_grant.enterprise', 1375)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
