-- 098: Ticket 8 Task 6 (second half) — a campaign must be able to END.
--
-- 49 campaigns stood open on 30 Aug, none had ever reached a terminal state.
-- Two silent leaks:
--   1. 44 of them had ZERO participants — inviterCandidates found no active
--      subscriber holding the target, the campaign opened anyway and nothing
--      ever revisited it (closeCampaignIfExhausted only fires on a decline
--      or a timed-out ask, and those need at least one participant).
--   2. Nothing bounded a campaign's lifetime — a straggler could stay open
--      forever even with the 21-day silent-ask sweep.
--
-- Two new terminal states, and the sweep closes both classes daily:
--   closed_no_inviters — opened, but nobody eligible to ask
--   closed_expired     — open past the max age, whatever the reason

ALTER TABLE invite_campaigns DROP CONSTRAINT IF EXISTS invite_campaigns_status_check;
ALTER TABLE invite_campaigns ADD CONSTRAINT invite_campaigns_status_check
  CHECK (status IN ('open', 'closed_joined', 'closed_declined_all', 'closed_exhausted',
                    'closed_no_inviters', 'closed_expired'));

-- The 44 standing empty campaigns close right now, in the migration itself —
-- the daily sweep keeps it true from here on.
UPDATE invite_campaigns c
SET status = 'closed_no_inviters', closed_at = NOW(),
    closed_reason = 'no eligible inviter (active subscriber holding this contact)'
WHERE c.status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM invite_campaign_participants p WHERE p.campaign_id = c.id
  );
