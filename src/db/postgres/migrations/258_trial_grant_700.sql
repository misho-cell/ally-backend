-- 258: Misho, 21 Oct (launch day): a free trial now carries 700 tokens, not 120.
-- The grant is credited once per trial, the first time the wallet is read, so
-- every trial credited from this deploy on gets 700; a trial already credited
-- keeps what it got. Editable in provider_prices, no deploy.
INSERT INTO provider_prices (price_key, value) VALUES
  ('tokens.trial_grant', 700)
ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value;
