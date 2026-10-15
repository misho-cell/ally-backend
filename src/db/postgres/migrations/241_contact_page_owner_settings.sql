-- The frontend's item 3 (Misho's yes, 14 Oct): on the contact page the owner
-- sets warmth, keeps their own labels and excludes a contact from one goal.
--
-- Warmth is written as the owner's hand-set tier, the store the assistant
-- already reads. The tier it replaced is kept, so „back to inferred" restores it
-- instead of losing an older hand-made choice.
ALTER TABLE human_relationship_tiers
  ADD COLUMN IF NOT EXISTS replaced_tier TEXT
    CHECK (replaced_tier IS NULL OR replaced_tier IN ('green', 'blue', 'yellow', 'red')),
  ADD COLUMN IF NOT EXISTS replaced_source TEXT;

-- An exclusion made from the page names the goal it is for.
ALTER TABLE contact_exclusions
  ADD COLUMN IF NOT EXISTS goal_id INTEGER;
