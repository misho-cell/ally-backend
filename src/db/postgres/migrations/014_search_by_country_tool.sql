INSERT INTO enabled_tools (tool_key, tool_label, is_enabled)
VALUES ('search_contacts_by_country', 'Search by Country', true)
ON CONFLICT (tool_key) DO NOTHING;
