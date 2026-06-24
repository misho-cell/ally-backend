INSERT INTO enabled_tools (tool_key, tool_label, is_enabled)
VALUES ('get_contact_count', 'Contact Count', true)
ON CONFLICT (tool_key) DO NOTHING;
