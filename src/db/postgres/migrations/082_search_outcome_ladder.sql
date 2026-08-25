-- Ticket 6, founder's answer ② (25 Aug): "success for us is when user get
-- his problem solved, and we don't know if the name we gave him was the
-- right answer." search_activity had no outcome tracking at all — result_count
-- was the only signal, and a returned name was never proof of anything.
-- Six states: no result / refused (with a reason) / accepted / message sent
-- / reply came back / followed up a week later (did it work).
--
-- Nullable, no default — safe, instant metadata-only DDL regardless of table
-- size (this is NOT migration 080's mistake: no backfill, no DEFAULT NOW()
-- forcing a rewrite across existing rows).
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS outcome_reason TEXT;
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS outcome_worked BOOLEAN;
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS outcome_updated_at TIMESTAMPTZ;

ALTER TABLE search_activity DROP CONSTRAINT IF EXISTS search_activity_outcome_check;
ALTER TABLE search_activity ADD CONSTRAINT search_activity_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('no_result', 'refused', 'accepted', 'sent', 'replied', 'followed_up'));
