-- 102: the THIRD visibility state — "used, never shown".
--
-- The founder's ruling (1 Sep): a private note about someone ("X's close
-- friend", "Y needs an investor") must help EVERY user's assistant find and
-- suggest that person, while its text is never displayed, never quoted, never
-- explained. Until now a fact had two states, and "private" removed it from
-- search for everyone but its author — so the knowledge was inert.
--
--   is_public = true                    → text may be shown to everyone
--   is_matchable = true, is_public=false → may influence WHO is found;
--                                          the text never leaves the server
--   both false                          → the author's eyes only
--
-- Public implies matchable (a public fact is already fully visible); the
-- column is kept separate so the two decisions stay independently revocable.
ALTER TABLE contact_facts
  ADD COLUMN IF NOT EXISTS is_matchable BOOLEAN NOT NULL DEFAULT FALSE;

-- Everything already public is matchable by definition.
UPDATE contact_facts SET is_matchable = TRUE WHERE is_public = TRUE AND is_matchable = FALSE;

-- The search paths filter on (is_public OR is_matchable OR own row); this
-- index serves the matchable half the same way the public one is served.
CREATE INDEX IF NOT EXISTS idx_contact_facts_matchable
  ON contact_facts (neo4j_contact_id)
  WHERE is_matchable = TRUE AND retracted_at IS NULL;
