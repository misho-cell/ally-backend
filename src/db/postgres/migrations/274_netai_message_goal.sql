-- 274 (#7825, founder 26 Oct): a Netai message written about one goal carries
-- that goal, so the person's answer can reach it (Korneli's 'ვკითხოთ' under
-- message 166 sat 28 hours). NULL for a message about nothing in particular.
ALTER TABLE netai_messages ADD COLUMN IF NOT EXISTS task_id INTEGER;
