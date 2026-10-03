-- Board #391: a question held by the recipient's 24-hour limit is now sent by
-- the server itself when the window reopens, through the same createAsk gates
-- the run's own send passes. It needs the phone id the plan named, because the
-- plan wall compares against it; a person can have more than one number.
-- Rows held before this column existed fall back to the person's own number.
ALTER TABLE held_asks ADD COLUMN IF NOT EXISTS contact_phone TEXT;
