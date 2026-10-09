-- 4225 (Axel base load, Misho's yes 9 Oct; §119): facts found on public pages
-- about Axel members and the people around them, written by one system saver.
-- Each keeps where it was read, when, and how sure the research is:
--   confirmed — two independent public sources, or the founder's own word
--   possible  — one source
--   rough     — a word test only (key `field`)
--   unknown   — no role found
ALTER TABLE contact_facts DROP CONSTRAINT IF EXISTS contact_facts_source_check;
ALTER TABLE contact_facts ADD CONSTRAINT contact_facts_source_check
  CHECK (source IS NULL OR source IN ('chat', 'sweep', 'label', 'debrief', 'public_research'));
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS fact_date DATE;
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS research_status TEXT
  CHECK (research_status IS NULL OR research_status IN ('confirmed', 'possible', 'rough', 'unknown'));
CREATE INDEX IF NOT EXISTS contact_facts_public_research_idx
  ON contact_facts (neo4j_contact_id)
  WHERE source = 'public_research';
