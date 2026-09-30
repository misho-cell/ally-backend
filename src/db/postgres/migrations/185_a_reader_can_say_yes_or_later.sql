-- ROW 300 — THE TWO NEW BUTTONS UNDER AN INCOMING ASK: „YES" AND „LATER".
--
-- Each is recorded from the tap, exactly like row 274's decline, and each is
-- acted on ONCE: the column being NULL is the guard that keeps a second tap
-- from writing a second line into the asker's goal.
--
-- offered_help_at  the reader pressed „yes, I can help"; the asker was told.
-- later_at         the reader pressed „later"; the asker was told, and the one
--                  reminder is re-timed to 24 hours after this instead of 48
--                  hours after the question.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS offered_help_at TIMESTAMPTZ;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS later_at TIMESTAMPTZ;
