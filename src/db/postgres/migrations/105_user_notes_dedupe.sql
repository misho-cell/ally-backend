-- 105: one note is one row. (Ticket 9 Task 32.5 — "the single source of truth
-- for a piece of state", first asked 12 August.)
--
-- The reader collapses duplicate notes on the way out, so get_user_notes
-- showed 6 while the privacy summary counted 8 raw rows and the deletion
-- preview promised to erase 8. Three surfaces, three answers, one underlying
-- fact — and the disagreement came from hiding the duplicates at read time
-- instead of not having them.
--
-- Collapsing the rows fixes every surface at once, and the index means the
-- read-time filter can never again be the only thing holding the illusion
-- together. Identical text only: nothing a person wrote differently is lost.
DELETE FROM user_notes a
USING user_notes b
WHERE a.user_id = b.user_id
  AND a.kind = b.kind
  AND lower(regexp_replace(btrim(a.text), '\s+', ' ', 'g'))
    = lower(regexp_replace(btrim(b.text), '\s+', ' ', 'g'))
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS user_notes_unique_text
  ON user_notes (user_id, kind, lower(regexp_replace(btrim(text), '\s+', ' ', 'g')));
