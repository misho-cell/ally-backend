-- 133: Ticket 13 Task 14 — the app's own assistant is still told
-- save_contact_fact(phone, field_type, value): three inputs, none of them the
-- confidence the tool has carried since fb17779. The 71 facts of 2 September
-- were written by the app, so the base prompt's MEMORY line has to say it too.
-- Same REPLACE pattern as 130/131: exact text, every row, idempotent.
UPDATE ai_config
SET system_prompt = REPLACE(
  system_prompt,
  'Facts about a person go to save_contact_fact(phone, field_type, value), value short, in the original language, using the established field names, because an invented synonym saves but is never found again.',
  'Facts about a person go to save_contact_fact(phone, field_type, value, confidence), value short, in the original language, using the established field names, because an invented synonym saves but is never found again. confidence is "stated" only when the user said it in their own words; "mentioned" when it comes from a web page, a search result, a label or your own reading between the lines, and such a fact is never shown as confirmed; a guess ("possibly", "probably") is not saved at all.'
)
WHERE strpos(system_prompt, 'save_contact_fact(phone, field_type, value),') > 0;
