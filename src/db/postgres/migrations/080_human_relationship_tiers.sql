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
-- Live-caught (25 Aug): this migration originally also ran the product-wide
-- backfill INSERT below inline — a JOIN + SORT over UserConnectionPhone's 3M
-- rows. The migration runner applies every file inside ONE transaction on
-- ONE connection, so that INSERT hit the connection's statement_timeout,
-- the whole migration rolled back, and the app crash-looped on every boot
-- (it re-attempts pending migrations on startup). Split: this file only
-- creates the table (fast DDL); the backfill is its own admin-triggered,
-- batched pass — see backfillHumanRelationshipTiers() in relationshipScores.ts.
CREATE TABLE IF NOT EXISTS human_relationship_tiers (
  user_id       INTEGER NOT NULL,
  contact_phone TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('green', 'blue', 'yellow', 'red')),
  source        TEXT NOT NULL,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_human_relationship_tiers_user
  ON human_relationship_tiers (user_id);
