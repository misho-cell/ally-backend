-- Close the registration door (explicit direction, 29 Jul): invite-only ON.
-- The flag previously existed but was seeded false with no way to flip it from
-- the app; an admin endpoint now exists (PUT /admin/flags/invite_only).
INSERT INTO app_flags (flag, enabled)
VALUES ('invite_only', true)
ON CONFLICT (flag) DO UPDATE SET enabled = true, updated_at = NOW();

-- Push subscriptions created by the retired frontend keep receiving pushes
-- (web-push does not care about CORS) — the cause of doubled notifications.
-- Endpoints don't identify which frontend created them, so reset the table;
-- clients silently re-subscribe on next open.
TRUNCATE push_subscriptions;

-- Format-independent membership lookups (membership.ts now compares digits).
CREATE INDEX IF NOT EXISTS idx_user_phone_digits
  ON "UserPhone" (regexp_replace(phone, '\D', '', 'g'));
