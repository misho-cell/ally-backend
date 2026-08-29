-- 094: D35 shadow phase (approved 29 Aug via Misho) — identity as a MAPPING
-- layer over the raw data, never a rewrite of it. Three stores:
--
--   person_identities  — phone -> person_id. The only writers are the
--                        auto-merge (one registered account's own UserPhone
--                        numbers, confidence 1.0 by definition) and an
--                        admin approving a candidate. NO read path consumes
--                        this yet (shadow): building the map and using the
--                        map ship separately, per the design.
--   identity_candidates — the admin review queue: suggested merges with the
--                        evidence that produced them. Auto-merge never
--                        happens from here.
--   person_merge_log   — every merge/unmerge, with what the prior state was,
--                        so unmerge is an exact restore, never a guess.
--
-- Raw rows (UserAlias/UserTags/contact_facts) are never modified.

CREATE TABLE IF NOT EXISTS person_identities (
  person_id  UUID NOT NULL,
  phone      TEXT NOT NULL PRIMARY KEY,
  confidence REAL NOT NULL CHECK (confidence > 0 AND confidence <= 1),
  evidence   JSONB NOT NULL,
  merged_by  TEXT NOT NULL,
  merged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_person_identities_person ON person_identities (person_id);

CREATE TABLE IF NOT EXISTS identity_candidates (
  id         SERIAL PRIMARY KEY,
  phones     TEXT[] NOT NULL,
  confidence REAL NOT NULL,
  evidence   JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_identity_candidates_status
  ON identity_candidates (status, confidence DESC);
-- One candidate per phone-set: the scan can re-run forever without duplicating
-- the queue (the array is stored sorted).
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_candidates_phones
  ON identity_candidates (phones);

CREATE TABLE IF NOT EXISTS person_merge_log (
  id               SERIAL PRIMARY KEY,
  action           TEXT NOT NULL CHECK (action IN ('merge', 'unmerge')),
  person_id        UUID NOT NULL,
  phones           TEXT[] NOT NULL,
  prior_person_ids UUID[] NOT NULL,
  evidence         JSONB,
  actor            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_person_merge_log_person ON person_merge_log (person_id);
