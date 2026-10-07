-- D712 (the founder, 7 Oct): the buttons under a question are written with
-- it, each with what it means (yes / no / later / answer), and kept here so a
-- tap, a reminder and the evening card read the same set. D711: the question
-- the reader was shown, after the editor check, in the reader's language.
-- NULL on every older ask: those keep their fixed buttons.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS choices JSONB;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS shown_question TEXT;
