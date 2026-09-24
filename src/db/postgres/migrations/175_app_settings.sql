-- A home for NUMBERS the dashboard sets, beside `app_flags` which holds the
-- switches. The founder, 24 September, on the free days for an invited person:
-- „it has to be switchable and at first we will set it on 20 days (from
-- dashboard) and then reduce those days to 10 or five."
--
-- So the number is a SETTING and not a constant, and it is changed on a screen
-- rather than by a deploy or a Railway variable.
--
-- ════════ WHY A NEW TABLE AND NOT AN EXISTING ONE ════════
--
-- `app_flags` is boolean only. `ai_config` is the system prompt. The only
-- numeric store is `provider_prices`, and putting a policy number in the price
-- table is a category error the next reader pays for: somebody auditing what
-- the product charges would find „how many free days an invitation carries"
-- sitting among the model prices, and somebody changing prices in bulk would
-- change it by accident.
--
-- It mirrors `app_flags` deliberately — same shape, same allow-list pattern in
-- the route — so the dashboard treats a number and a switch alike and nobody
-- has to learn a second idea.
--
-- ════════ IT IS A MONEY CONTROL ════════
--
-- A row here hands out free time. `value` is numeric and the route bounds it;
-- the register (ADMIN_WRITE_OPERATIONS.md §35) carries who may change it and
-- what each value costs. `updated_by` is written so a change is never
-- anonymous — „who set it to 40" must have an answer.
CREATE TABLE IF NOT EXISTS app_settings (
  setting     text PRIMARY KEY,
  value       numeric     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_by  text
);

-- The starting value the founder named. Written here rather than defaulted in
-- code so the dashboard has something to show on the first load, and so the
-- number a person reads on the screen is the number the grant uses — one
-- source, not a constant in TypeScript that a row may or may not override.
INSERT INTO app_settings (setting, value, updated_by)
VALUES ('invite_free_days', 20, 'founder (24 Sep, D485)')
ON CONFLICT (setting) DO NOTHING;
