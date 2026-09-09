-- 131: Ticket 12 Task 78 — the sentence of migration 130 comes out again.
--
-- The founder withdrew Ticket 11 Task 2 on 9 September (D145): the web check
-- on a person runs for EVERYONE; whether a legal, political, health or family
-- finding is spoken is the prompt team's rule and is live. The exact text 130
-- appended is removed; the original paragraph stays as it was. Idempotent.
UPDATE ai_config
SET system_prompt = REPLACE(
  system_prompt,
  ' This standing check is only for a PUBLIC person you yourself put forward as a route. It never runs for a person who is already the user''s own direct contact when the question is how to approach, meet or write to them — for those, the record and the saved words are the whole picture, and you do not search the web about the person at all.',
  ''
)
WHERE strpos(system_prompt, 'This standing check is only for a PUBLIC person') > 0;
