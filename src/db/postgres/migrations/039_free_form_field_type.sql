-- field_type is now free-form: the prompt can save a rich profile (role, skill,
-- expertise, education, need, …), not just the four core facts. Only the four
-- core facts stay single-value (one row per contact per field); every other key
-- accumulates. Widen the partial unique index from "everything except note" to
-- "only the four core facts", so all non-core keys are free INSERTs.
DROP INDEX IF EXISTS uq_contact_facts_structured;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_facts_structured
  ON contact_facts (neo4j_contact_id, submitted_by_user_id, field_type)
  WHERE field_type IN ('occupation', 'employer', 'city', 'industry');
