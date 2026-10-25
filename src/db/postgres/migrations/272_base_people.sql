-- 272: the people the Axel package knows, numbered or not, and the ties it states
-- between them (board 6997). Loaded by POST /admin/base-people/load; read by the
-- find_people_in_base tool. A person with no number lives here only.

-- One person under the package's own key. phone is the number when the server
-- found one (a token in the members' phonebooks, or a member's account).
CREATE TABLE IF NOT EXISTS base_people (
  person_key   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT,
  -- Lower-case name + every fact's value: the words a need is matched on.
  search_text  TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_base_people_phone ON base_people (phone);

-- Confirmed facts that may be said: work, study, reach. Never phonebook-derived ones.
CREATE TABLE IF NOT EXISTS base_person_facts (
  person_key  TEXT NOT NULL REFERENCES base_people (person_key) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source_url  TEXT NOT NULL DEFAULT '',
  fact_date   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (person_key, key, value)
);

-- A stated tie between two people (classmates, same company, saved in phonebook).
-- For routing: it says who can reach whom, read both ways.
CREATE TABLE IF NOT EXISTS base_person_ties (
  from_key  TEXT NOT NULL REFERENCES base_people (person_key) ON DELETE CASCADE,
  to_key    TEXT NOT NULL REFERENCES base_people (person_key) ON DELETE CASCADE,
  tie       TEXT NOT NULL,
  basis     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (from_key, to_key, tie)
);
CREATE INDEX IF NOT EXISTS idx_base_person_ties_to ON base_person_ties (to_key);
