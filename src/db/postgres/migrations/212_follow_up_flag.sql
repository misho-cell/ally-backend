-- #2080 (the founder, D703): „mark as unread / follow up". A one-tap flag on an
-- update card or a დავალება row keeps it in front of its owner until a second
-- tap clears it. NULL is „not flagged"; nothing existing is flagged.
ALTER TABLE pending_updates ADD COLUMN IF NOT EXISTS followed_at TIMESTAMPTZ;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS followed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS pending_updates_followed_idx
  ON pending_updates (user_id, followed_at) WHERE followed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS threads_followed_idx
  ON threads (user_id, followed_at) WHERE followed_at IS NOT NULL;
