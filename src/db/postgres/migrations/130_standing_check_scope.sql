-- 130: one sentence in the base prompt (Ticket 11 Task 2; Q-94).
--
-- The base prompt lives in ai_config.system_prompt. Its paragraph „Currency is
-- only half the check… check their standing too" sends the model to the web
-- for ANY person — including the user's own close contact when the question
-- is how to approach him, which is how thread 13058 opened with the man's
-- arrest (1 of 12 samples, 7 Sep; Run 26 had it too). The check is for a
-- public person the assistant puts forward as a route; it never runs for a
-- direct contact on an approach question. Idempotent: REPLACE is a no-op once
-- the sentence is there, and a no-op if the paragraph was reworded.
UPDATE ai_config
SET system_prompt = REPLACE(
  system_prompt,
  'never surface someone who is in jail, disgraced, out of the role or dead.',
  'never surface someone who is in jail, disgraced, out of the role or dead. This standing check is only for a PUBLIC person you yourself put forward as a route. It never runs for a person who is already the user''s own direct contact when the question is how to approach, meet or write to them — for those, the record and the saved words are the whole picture, and you do not search the web about the person at all.'
)
WHERE strpos(system_prompt, 'This standing check is only for a PUBLIC person') = 0;
