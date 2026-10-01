-- ROW 305 (b) / D530 — the switch for a follow-up request continuing the
-- conversation (migration 188). OFF by default: the mediator's Accept /
-- Decline in an ask thread needs the client's half, and until that is live a
-- real mediator would see the request with no buttons under it. Turned on
-- from /admin/flags once the frontend confirms (registered first, D44).
INSERT INTO app_flags (flag, enabled)
VALUES ('intro_follow_up_in_conversation', false)
ON CONFLICT (flag) DO NOTHING;
