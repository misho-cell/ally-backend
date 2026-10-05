-- H (Misho, 5 Oct: „H … კი"): a pending Chorus ask whose inviter has no
-- CONFIRMED warm tie to the target is held for good by D544 — the send-time
-- check refuses it every time, so it stood as „pending" forever and read, on
-- the admin page, as an ask waiting for its schedule. Such an ask can now be
-- closed: state 'withdrawn', with the reason kept on the row. Nothing is sent
-- and nothing is deleted; the undo puts the row back to 'pending', where D544
-- still holds it.
ALTER TABLE invite_campaign_participants DROP CONSTRAINT IF EXISTS invite_campaign_participants_state_check;
ALTER TABLE invite_campaign_participants ADD CONSTRAINT invite_campaign_participants_state_check
  CHECK (state IN ('pending', 'asked', 'agreed', 'declined', 'told', 'joined', 'withdrawn'));

ALTER TABLE invite_campaign_participants ADD COLUMN IF NOT EXISTS closed_reason TEXT;
