-- Board #893, the row's state as the work goes on: the number of the owner's
-- contact a row's way in goes through, kept server-side only, so the goal's
-- asks to that person are tied to the row (asked / answered) without matching
-- names. Never returned to the model, never exported.
ALTER TABLE list_items ADD COLUMN IF NOT EXISTS through_phone TEXT;
