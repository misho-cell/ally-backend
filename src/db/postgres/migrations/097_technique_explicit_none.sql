-- 097: Ticket 8 Task 5 — three values on EVERY growth ask (D50, the founder's
-- "including the five that exist").
--
-- The missing piece was a way to say "none" honestly: the five live asks were
-- sent by Chorus on a schedule (no conversational moment WHEN) and with the
-- pre-29-Aug message (no REASON text) — stamping any 1-4 / 9-10 onto them
-- would fabricate data the conversion table is supposed to measure. So 0 is
-- now a legal stored value meaning "explicitly none": known, and known to be
-- absent. NULL keeps meaning "unknown". The lab table groups by value, so the
-- 0-groups become their own rows exactly like the NULL rows did.

ALTER TABLE invite_campaign_participants
  DROP CONSTRAINT IF EXISTS invite_campaign_participants_technique_when_check;
ALTER TABLE invite_campaign_participants
  ADD CONSTRAINT invite_campaign_participants_technique_when_check
  CHECK (technique_when = 0 OR technique_when BETWEEN 1 AND 4);

ALTER TABLE invite_campaign_participants
  DROP CONSTRAINT IF EXISTS invite_campaign_participants_technique_how_check;
ALTER TABLE invite_campaign_participants
  ADD CONSTRAINT invite_campaign_participants_technique_how_check
  CHECK (technique_how = 0 OR technique_how BETWEEN 5 AND 8);

ALTER TABLE invite_campaign_participants
  DROP CONSTRAINT IF EXISTS invite_campaign_participants_technique_reason_check;
ALTER TABLE invite_campaign_participants
  ADD CONSTRAINT invite_campaign_participants_technique_reason_check
  CHECK (technique_reason = 0 OR technique_reason BETWEEN 9 AND 10);

-- The five existing asks (all sent 28 Aug 03:22, scheduled, old message):
-- WHEN = 0 (Chorus sends on a schedule — a fact, not an unknown).
UPDATE invite_campaign_participants
SET technique_when = 0
WHERE asked_at IS NOT NULL AND technique_when IS NULL;

-- REASON = 0 only for asks sent before the reason text entered the message
-- (29 Aug, CHORUS_TECHNIQUE_REASON=9 + „ერთად ვიზრდებით") — never onto
-- anything newer, where NULL would be a real unknown to investigate.
UPDATE invite_campaign_participants
SET technique_reason = 0
WHERE asked_at IS NOT NULL
  AND asked_at < '2026-08-29T00:00:00Z'
  AND technique_reason IS NULL;
