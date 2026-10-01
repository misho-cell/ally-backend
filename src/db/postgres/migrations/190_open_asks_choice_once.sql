-- ROW 311 — the „close the other questions / keep them open" card acts ONCE.
--
-- The tester's 941: after either button had acted, a later tap on the OTHER
-- one acted too — „keep" on a closed card reopened the goal, „close" on a kept
-- card cancelled a question the owner had kept. A tap is matched by its words,
-- so the card itself has to remember that it was answered.
--
-- offered_at: the server wrote the card for this goal (offerOpenAsksChoice).
-- settled_at: the first tap acted; every later tap changes nothing.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS open_asks_offered_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS open_asks_settled_at TIMESTAMPTZ;
