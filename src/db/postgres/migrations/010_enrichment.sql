CREATE TABLE contact_enrichment (
  phone                  TEXT    PRIMARY KEY,
  gender                 TEXT,
  gender_confidence      FLOAT,
  country_code           TEXT,
  nationality            TEXT,
  nationality_source     TEXT,
  nationality_confidence FLOAT,
  industry               TEXT,
  industry_confidence    FLOAT,
  seniority              TEXT,
  is_decision_maker      BOOLEAN,
  enriched_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_relationship_scores (
  user_id           INTEGER   NOT NULL,
  contact_phone     TEXT      NOT NULL,
  relationship_type TEXT      NOT NULL,
  strength_score    FLOAT     NOT NULL,
  signals           JSONB     NOT NULL DEFAULT '{}',
  computed_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, contact_phone)
);

CREATE INDEX idx_rel_scores_user_strength
  ON contact_relationship_scores (user_id, strength_score DESC);

CREATE INDEX idx_rel_scores_contact
  ON contact_relationship_scores (contact_phone);

CREATE TABLE enrichment_jobs (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type     TEXT      NOT NULL DEFAULT 'full',
  status       TEXT      NOT NULL DEFAULT 'pending',
  total        INTEGER,
  processed    INTEGER   NOT NULL DEFAULT 0,
  failed       INTEGER   NOT NULL DEFAULT 0,
  started_at   TIMESTAMP,
  completed_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
