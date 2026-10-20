-- #6535 (Giorgi, G-151; Misho's yes 20 Oct): a case description says only the
-- owner's goal — no progress, helpers or answers. Descriptions written under the
-- earlier rule told the progress, so each is written once more under the new
-- one. The rule a description was written under is stored with it; one written
-- before this column existed has none and counts as written under the old rule.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS case_description_rule smallint;
