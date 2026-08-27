-- 088: Ticket 7 Task 14 (engine T16, founder's ruling D50) — the technique
-- tag: THREE values per growth ask, one from each group of the ten
-- techniques. A — WHEN to ask (1 the moment it worked · 2 thank him first ·
-- 3 the first session · 4 the failed search), B — HOW to phrase (5 name the
-- person · 6 the advice ask · 7 make refusing free · 8 text him now),
-- C — the REASON given (9 we grow together · 10 the thanks that comes back).
-- NULL = unknown — allowed but counted, per the ruling. Chorus stamps its own
-- values at send time; the assistant reports through
-- respond_to_invite_campaign. The lab report's technique conversion table
-- reads these columns. Additive nullable columns on existing rows: safe DDL.

ALTER TABLE invite_campaign_participants
  ADD COLUMN IF NOT EXISTS technique_when SMALLINT CHECK (technique_when BETWEEN 1 AND 4);
ALTER TABLE invite_campaign_participants
  ADD COLUMN IF NOT EXISTS technique_how SMALLINT CHECK (technique_how BETWEEN 5 AND 8);
ALTER TABLE invite_campaign_participants
  ADD COLUMN IF NOT EXISTS technique_reason SMALLINT CHECK (technique_reason BETWEEN 9 AND 10);
