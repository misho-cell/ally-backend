-- 093: D34 (approved 29 Aug via Misho) — a relationship edge between two of
-- the user's CONTACTS ("X is Y's brother"): stored, warms search ranking,
-- NEVER spoken. user-scoped: the same real-world tie known by two different
-- users is two independent private rows — relationship knowledge never
-- aggregates publicly (deliberately the opposite of the crowd-facts rule;
-- kinship is sensitive by default). disclosable defaults FALSE and only an
-- admin may ever raise it. The pair is stored ordered (phone_a < phone_b)
-- so one tie is one row regardless of the order it was said in.
CREATE TABLE IF NOT EXISTS contact_relationships (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  phone_a     TEXT NOT NULL,
  phone_b     TEXT NOT NULL,
  relation    TEXT NOT NULL,
  disclosable BOOLEAN NOT NULL DEFAULT FALSE,
  source      TEXT NOT NULL DEFAULT 'chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (phone_a < phone_b),
  UNIQUE (user_id, phone_a, phone_b, relation)
);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_user
  ON contact_relationships (user_id);
-- The ranking read probes by pair members for one user's page of results.
CREATE INDEX IF NOT EXISTS idx_contact_relationships_user_a
  ON contact_relationships (user_id, phone_a);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_user_b
  ON contact_relationships (user_id, phone_b);
