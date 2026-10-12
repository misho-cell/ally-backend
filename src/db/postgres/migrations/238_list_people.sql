-- 4126 item 3 (D757 point 2; Misho's yes §133): people found on public member
-- lists, whom no user may know. Only what the list itself says: name,
-- organisation, the listed role, where and when it was read. No phone and no
-- photo. Such a person is never a „knows" link and never an introduction route.
-- matched_phone is set only by the same-name check (listPeople.service.ts),
-- and only when it leaves no doubt; on doubt the row stays unmerged.
CREATE TABLE IF NOT EXISTS list_people (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  organisation  TEXT NOT NULL CHECK (length(trim(organisation)) > 0),
  listed_role   TEXT,
  source_url    TEXT NOT NULL CHECK (source_url ~ '^https?://'),
  checked_on    DATE NOT NULL,
  matched_phone TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS list_people_once_idx
  ON list_people (lower(name), lower(organisation), source_url);
