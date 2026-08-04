-- "Not this person, for this, and here is why" — a scoped, reasoned exclusion
-- (not a blocklist: the reason expires, so scope + reason + revisit condition
-- are stored, and the fields ride INSIDE search results).
CREATE TABLE IF NOT EXISTS contact_exclusions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  contact_phone TEXT    NOT NULL,
  excluded_for  TEXT    NOT NULL,
  reason        TEXT    NOT NULL,
  revisit_if    TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_phone, excluded_for)
);

CREATE INDEX IF NOT EXISTS idx_contact_exclusions_user ON contact_exclusions (user_id, contact_phone);

-- A saved fact can now be marked WRONG instead of piling corrections next to
-- it: retracted rows stay for audit but leave every read path.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMP;

-- One polite reminder per unanswered ask.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP;
