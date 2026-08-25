-- Live-caught (24 Aug): get_invite_link hands out https://www.netai.guru/join?ref=CODE
-- and that page 404s — the tool shipped before the landing page did, on an
-- invite-only product with exactly one front door. Disabling until the page
-- exists; flip is_enabled back to true from /admin/tools (or re-run this
-- migration's inverse) once it's live.
UPDATE enabled_tools SET is_enabled = false, updated_at = NOW() WHERE tool_key = 'get_invite_link';
