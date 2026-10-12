-- 4126 item 1 (D757 §5; Misho's „შეზღუდე", §122 scope): a new user is
-- researched ONCE, at registration, within a hard stop. The primary key is the
-- „once": a second row for the same user cannot exist. The counters are what the
-- run spent, so the stop can be checked from the record.
CREATE TABLE IF NOT EXISTS registration_research (
  user_id     INTEGER PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'done', 'failed')),
  searches    INTEGER NOT NULL DEFAULT 0,
  pages       INTEGER NOT NULL DEFAULT 0,
  facts       INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS registration_research_queued_idx
  ON registration_research (queued_at) WHERE status = 'queued';

-- 4126 item 2: two sources that disagree are both kept, and the fact says so.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS conflict_note TEXT;
