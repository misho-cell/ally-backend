-- 134: Ticket 13 Task 14, second occurrence. The live base prompt names the
-- tool twice; 133 fixed the MEMORY line, this fixes the SAVING WHAT YOU LEARN
-- line, which still said three inputs and „no permission needed". Exact text,
-- every row, idempotent.
UPDATE ai_config
SET system_prompt = REPLACE(
  system_prompt,
  'Use save_contact_fact(phone, field_type, value), value short, in the original language, no permission needed.',
  'Use save_contact_fact(phone, field_type, value, confidence), value short, in the original language, no permission needed; confidence "stated" only for what the user said themselves, "mentioned" for anything read from the web, a search result or a label, and never a guess.'
)
WHERE strpos(system_prompt, 'Use save_contact_fact(phone, field_type, value), value short') > 0;
