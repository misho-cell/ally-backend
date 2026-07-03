-- MCP connector (claude.ai custom connector, Stage 1).
-- Off by default — enabling is an explicit admin action:
--   UPDATE app_flags SET enabled = true WHERE flag = 'mcp_enabled';
INSERT INTO app_flags (flag, enabled)
VALUES ('mcp_enabled', false)
ON CONFLICT (flag) DO NOTHING;

-- Per-tool-call cost placeholder so kind='mcp_tool' usage is measurable from
-- day one. Zero until real infra numbers exist; updating the price later is a
-- DB change, not a deploy.
INSERT INTO provider_prices (price_key, value)
VALUES ('mcp.tool_call', 0)
ON CONFLICT (price_key) DO NOTHING;
