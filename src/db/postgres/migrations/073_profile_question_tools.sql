-- Ticket 6, task 3 — the founder's ruling: Part H's personalization
-- questions live in chat, asked by the assistant at a fitting moment, not
-- on a settings-style screen. Toggleable (not the always-on core tool
-- list) so the founder has an off switch from /admin/tools without a
-- deploy if this needs to be paused.
INSERT INTO enabled_tools (tool_key, tool_label, is_enabled)
VALUES
  ('get_profile_question', 'პროფილის კითხვა', true),
  ('answer_profile_question', 'პროფილის კითხვაზე პასუხი', true)
ON CONFLICT (tool_key) DO NOTHING;
