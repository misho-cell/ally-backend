-- #7758 (the founder's word via the tester, 29 Oct; Misho's yes „კი, შენი
-- რჩევით გააკეთე"): where a person in the store worked and when, from public
-- pages, each row with its source. Only people already in the store. Used to
-- find „former colleagues" routes (base_person_ties, basis 'employment
-- overlap'), never shown as a profile. A person's rows are removed with them.
CREATE TABLE IF NOT EXISTS base_person_employment (
  person_key   TEXT NOT NULL REFERENCES base_people (person_key) ON DELETE CASCADE,
  employer     TEXT NOT NULL,
  -- The employer as it is compared: lower case, letters and digits only.
  employer_key TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  from_year    INT,
  -- NULL: still there.
  to_year      INT,
  source_url   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_base_person_employment_row
  ON base_person_employment (person_key, employer_key, COALESCE(from_year, 0));
CREATE INDEX IF NOT EXISTS idx_base_person_employment_employer
  ON base_person_employment (employer_key);
