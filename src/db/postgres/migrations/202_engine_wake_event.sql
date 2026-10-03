-- The tester's 1100 (request 2839, goal 14966): an introduction was accepted at
-- 11:44:11.7, its outcome wake was due six seconds later, and the old container
-- took SIGTERM at 11:44:17.767. The wake lived only in a timer, so the goal never
-- heard the answer. Introduction outcomes now leave a row like day one does.
--
-- Unlike day one, the outcome's words are made from the answer at that moment
-- (who answered, yes or no, whether contacts were exchanged), and the sweeper
-- has no other place to read them from. So this kind carries its event text.
-- Day one keeps NULL here and its words stay in the code.
ALTER TABLE engine_wakes ADD COLUMN IF NOT EXISTS event_text JSONB;
