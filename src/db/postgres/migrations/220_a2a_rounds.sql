-- 1688 (A5, D679/D680): how many times in a row the asker's assistant has
-- written to this person on one goal without the owner typing anything — a
-- clarifying question answered from the goal, a reply to a reply. At 2 the
-- assistant stops and the owner answers; the next ask the owner's own words
-- caused starts again at 0. Stamped on each ask row as it is written.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS a2a_rounds SMALLINT NOT NULL DEFAULT 0;
