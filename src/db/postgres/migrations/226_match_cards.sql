-- 1699 part 2 (A16): where each of the two no-name cards was shown, and when,
-- so a tap on it finds its match. Card 1 goes to the need's owner, card 2 to
-- the offer's owner after the first yes.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS card1_thread_id INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS card1_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS card2_thread_id INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS card2_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_matches_card1_thread ON matches (card1_thread_id) WHERE state = 'card1';
CREATE INDEX IF NOT EXISTS idx_matches_card2_thread ON matches (card2_thread_id) WHERE state = 'need_yes';
