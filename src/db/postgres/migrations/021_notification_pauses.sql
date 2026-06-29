-- Timed pauses for AI nudges:
--   paused_until   — set when the user ignores 3 nudges in a row (14-day cooldown)
--   distress_until — set when the agent detects the user is in distress
ALTER TABLE ai_notification_settings
  ADD COLUMN IF NOT EXISTS paused_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distress_until TIMESTAMPTZ;
