-- Cursor for the nightly note-moderation sweep: a row is checked by the agent
-- exactly once. New saves are moderated inline (stamped at insert); legacy
-- private rows have NULL here and get swept by the nightly job in batches.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_contact_facts_unmoderated
  ON contact_facts (id)
  WHERE moderated_at IS NULL AND is_public = false;
