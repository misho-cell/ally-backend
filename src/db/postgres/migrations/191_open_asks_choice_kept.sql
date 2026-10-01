-- ROW 311, the tester's 944: a later tap on an answered card replied „the
-- other questions are closed too" on a card whose owner had KEPT them open.
-- The card remembered THAT it was answered (190), not HOW. This is how:
-- 'close' or 'keep', written by the tap that claimed the card.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS open_asks_choice TEXT
  CHECK (open_asks_choice IS NULL OR open_asks_choice IN ('close', 'keep'));
