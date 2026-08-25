-- Ticket 6 task 4: the old-Ally colour classification ("Ally-ს ფერები") was
-- never a colour in the database — it was a number. The founder's 19 August
-- finding of "no colour data" was a true answer to the wrong query: the
-- weight lives on UserConnection.weight/relationshipStatus (old-Ally's own
-- hand-sorted classification screen), joined to phones through
-- UserConnectionPhone. Verified against production: user 501's own
-- allies/loyal/connections counts (69/150/376) match his old-Ally screenshot
-- exactly, weight 1/2/3 respectively.
--
-- This is a HUMAN judgment, made by hand, once, years ago in some cases — it
-- must never be silently overwritten by a machine score. contact_relationship_scores
-- is the machine-computed table (relationship_type/strength_score are NOT NULL,
-- written by the enrichment job); overloading it here would either force a
-- fabricated placeholder score into new rows or risk the next enrichment run
-- clobbering a human's choice. A dedicated table keeps the two values side by
-- side, exactly as ticket 6's task 4 conflict rule requires: the human's tier
-- is never computed over, and both a hand-set and a computed value can be
-- read for the same contact.
--
-- Storing all four old-Ally tiers, not just green/blue — "Netai wants green
-- and blue only" is a product decision about what to SURFACE, not a reason
-- to discard the other two at the storage layer (ticket 6's own "existing
-- contacts are the biggest asset" ruling applies here too).
CREATE TABLE IF NOT EXISTS human_relationship_tiers (
  user_id       INTEGER NOT NULL,
  contact_phone TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('green', 'blue', 'yellow', 'red')),
  source        TEXT NOT NULL,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, contact_phone)
);

-- One-time backfill from the old-Ally classification, product-wide (~273k
-- rows). allies=green, loyal=blue, connections=yellow, contacts=red — the
-- same weight ordering (1/2/3/4) the old product itself used. A phone with
-- more than one UserConnection row for the same user (rare) keeps its
-- warmest tier via ON CONFLICT DO NOTHING with MIN(weight) pre-selected.
INSERT INTO human_relationship_tiers (user_id, contact_phone, tier, source, set_at)
SELECT DISTINCT ON (uc."originUserId", ucp.phone)
  uc."originUserId",
  ucp.phone,
  CASE uc."relationshipStatus"
    WHEN 'allies' THEN 'green'
    WHEN 'loyal' THEN 'blue'
    WHEN 'connections' THEN 'yellow'
    WHEN 'contacts' THEN 'red'
  END,
  'old_ally_classify',
  NOW()
FROM "UserConnection" uc
JOIN "UserConnectionPhone" ucp ON ucp."connectionId" = uc.id
WHERE uc."relationshipStatus" IN ('allies', 'loyal', 'connections', 'contacts')
ORDER BY uc."originUserId", ucp.phone,
  CASE uc."relationshipStatus"
    WHEN 'allies' THEN 1 WHEN 'loyal' THEN 2 WHEN 'connections' THEN 3 ELSE 4
  END
ON CONFLICT (user_id, contact_phone) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_human_relationship_tiers_user
  ON human_relationship_tiers (user_id);
