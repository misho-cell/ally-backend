-- 260: Misho, 21 Oct (launch day), after testing 258: a free trial carries 2,000 tokens,
-- not 700. Same rule as 258: every trial credited from this deploy on gets 2,000; a trial
-- already credited keeps what it got. Editable in provider_prices, no deploy.
INSERT INTO provider_prices (price_key, value) VALUES
  ('tokens.trial_grant', 2000)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
