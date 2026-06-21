CREATE TABLE contact_facts (
  id                   SERIAL PRIMARY KEY,
  neo4j_contact_id     TEXT    NOT NULL,
  submitted_by_user_id INTEGER NOT NULL,
  field_type           TEXT    NOT NULL,
  value                TEXT    NOT NULL,
  is_public            BOOLEAN NOT NULL DEFAULT false,
  canonical_value      TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW(),
  UNIQUE (neo4j_contact_id, submitted_by_user_id, field_type)
);

CREATE INDEX idx_contact_facts_contact ON contact_facts(neo4j_contact_id, is_public);
CREATE INDEX idx_contact_facts_user    ON contact_facts(submitted_by_user_id);
