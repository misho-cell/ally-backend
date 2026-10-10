-- The frontend's 06:30Z item 6 (Misho, the new design): the evening card's hour
-- is the person's own setting. NULL keeps the default (19:00, #1850).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS evening_card_hour SMALLINT
  CHECK (evening_card_hour IS NULL OR evening_card_hour BETWEEN 8 AND 22);
