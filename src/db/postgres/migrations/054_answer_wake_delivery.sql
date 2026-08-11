-- 054: guaranteed answer-wake delivery (ticket 4 blocker 1).
-- On 11 Aug, 3 of 7 A2A rounds captured the recipient's answer but never woke
-- the asking task (deploy-window failures: "[ask-capture] failed: relation
-- task_asks does not exist"); the owner's side slept until the nightly review.
-- wake_delivered_at marks that the asking task was actually woken for this
-- answer; a 5-minute sweep in the task engine re-delivers any answered ask
-- still unmarked, so a dropped wake is late by minutes, never by a day.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS wake_delivered_at TIMESTAMPTZ;

-- Backfill: everything answered before this migration was already handled
-- (live or by the nightly review) — the sweep must not re-wake history.
UPDATE task_asks
SET wake_delivered_at = answered_at
WHERE answered_at IS NOT NULL AND wake_delivered_at IS NULL;
