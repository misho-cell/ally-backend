-- 118: the human yes/no at the end of the target list (tasks 1–10).
--
-- From the criteria document, the one line no formula replaces:
--
--   „ფაუნდერის საკუთარი მაგალითი: ნანა ყველა მანქანური სიგნალით №1 კანდიდატია
--    — 2,128 კონტაქტი, 28 გახსნა, ნამდვილი თანამდებობა, 65 ტელეფონის წიგნი.
--    და ის მისი მეუღლეა."
--
-- Family, friendship and the private reasons a person is the wrong person to
-- approach are nowhere in this schema and never will be. So the list ends with
-- a two-second human yes or no, and this table is where that answer lives.
--
-- „no" is a real exclusion, not a demotion: the engine drops the person the
-- same way it drops a hotline, and the gate ledger counts it like any other so
-- the founder can see how many his own rulings removed this week. „yes" is
-- recorded rather than acted on — it means „approach this person", which is
-- what the invite engine was already free to do.
CREATE TABLE IF NOT EXISTS target_decisions (
  id            BIGSERIAL   PRIMARY KEY,
  phone         TEXT        NOT NULL,
  -- 'yes' or 'no'. Anything a human typed that means neither is refused at the
  -- door rather than guessed at: a mis-parsed „maybe" that reads as „no"
  -- silently deletes a person from every future list.
  decision      TEXT        NOT NULL CHECK (decision IN ('yes', 'no')),
  -- Why. Optional, and the only place a private reason is ever written down —
  -- „ეს ჩემი მეუღლეა" belongs here and nowhere the product can read it aloud.
  note          TEXT,
  decided_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One standing answer per person. A second thought replaces the first; the
-- history of the list itself is in target_score_history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_target_decisions_phone
  ON target_decisions (phone);
