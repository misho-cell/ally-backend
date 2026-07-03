-- Tier-aware monthly token grants:
--   Ally Pro        $19.99 → 1000 tokens ($10 budget,  profit $7.99)
--   Ally Enterprise $79.00 → 5500 tokens ($55 budget,  profit $19.00)
--   premium (legacy team/early accounts, non-paying) → same as Pro
-- The tierless tokens.monthly_grant stays as the fallback for unknown tiers.
INSERT INTO provider_prices (price_key, value) VALUES
  ('tokens.monthly_grant.pro',        1000),
  ('tokens.monthly_grant.enterprise', 5500),
  ('tokens.monthly_grant.premium',    1000)
ON CONFLICT (price_key) DO NOTHING;
