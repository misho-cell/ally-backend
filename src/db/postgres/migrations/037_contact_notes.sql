-- Free-text "note" memories accumulate (many per contact), while the four
-- structured facts (occupation/employer/city/industry) stay one-per-field.
-- The original table-level UNIQUE(neo4j_contact_id, submitted_by_user_id,
-- field_type) forbade more than one row per field, which would cap notes at one.
-- Replace it with a PARTIAL unique index that excludes notes: structured facts
-- keep their single-row guarantee (and remain valid ON CONFLICT arbiters),
-- while 'note' rows are inserted freely.
--
-- contact_facts is small (user-submitted facts), so a plain non-concurrent index
-- build is fine here — unlike the millions-row UserTags index in migration 036.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'contact_facts'::regclass AND contype = 'u'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE contact_facts DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_facts_structured
  ON contact_facts (neo4j_contact_id, submitted_by_user_id, field_type)
  WHERE field_type <> 'note';
