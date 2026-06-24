-- contact_insights.user_id was incorrectly typed as UUID;
-- app userId is a numeric string, not a UUID.
ALTER TABLE contact_insights DROP CONSTRAINT IF EXISTS contact_insights_user_id_fkey;
ALTER TABLE contact_insights DROP CONSTRAINT IF EXISTS contact_insights_user_id_neo4j_contact_id_key;
ALTER TABLE contact_insights ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE contact_insights ADD CONSTRAINT contact_insights_user_id_neo4j_contact_id_key UNIQUE (user_id, neo4j_contact_id);
