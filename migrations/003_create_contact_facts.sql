CREATE TABLE IF NOT EXISTS contact_facts (
  id                   BIGSERIAL PRIMARY KEY,
  neo4j_contact_id     TEXT        NOT NULL,
  submitted_by_user_id TEXT        NOT NULL,
  field_type           TEXT        NOT NULL,
  value                TEXT        NOT NULL,
  is_public            BOOLEAN     NOT NULL DEFAULT false,
  canonical_value      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_facts_unique UNIQUE (neo4j_contact_id, submitted_by_user_id, field_type)
);

CREATE INDEX IF NOT EXISTS idx_contact_facts_contact_id
  ON contact_facts (neo4j_contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_facts_user_id
  ON contact_facts (submitted_by_user_id);
