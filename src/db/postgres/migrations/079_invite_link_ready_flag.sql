-- Corrects 078: get_invite_link was never actually gated by enabled_tools —
-- it's in chat.service.ts's ALWAYS-ON tool array, not ALL_TOOL_DEFINITIONS,
-- and the MCP connector doesn't consult enabled_tools at all (every
-- registerTool call there is unconditional). So 078's UPDATE was a no-op;
-- get_invite_link kept working on the connector after that deploy. This is
-- the real kill switch, checked inside getInviteLink() itself — the one
-- function both chat.service.ts and the MCP handler call — so it applies
-- to both surfaces from a single check. Defaults to false: off until the
-- /join landing page exists, flip from /admin/flags/invite_link_ready.
INSERT INTO app_flags (flag, enabled) VALUES ('invite_link_ready', false)
ON CONFLICT (flag) DO NOTHING;
