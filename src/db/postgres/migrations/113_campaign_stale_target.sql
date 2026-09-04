-- 113: a campaign whose target the filter no longer chooses (ticket 9 task
-- 13.6).
--
-- The filter DOES run every time a campaign opens — the list is rebuilt from
-- scratch on every pass. What it cannot do is reach backwards: 21 of the 39
-- open campaigns were opened before the person/trade/organisation gates
-- shipped (five on 27 August, thirteen on 31 August, three at 02:55 on
-- 4 September — the gates deployed at 06:43 the same morning), and they carry
-- exactly the targets the gates exist to stop: „ახალგაზრდული ასოციაცია" (an
-- organisation), „Tornike Mezobeli" (Tornike the neighbour), „გიორგის კარები"
-- (a door shop), „btu mariami", „Ariana", „Kato", plus five test leftovers
-- named act / marika / george / wissol.
--
-- Left alone they do not merely sit there: on day 4, 7 and 10 each one asks
-- the NEXT inviter on its list, so the founder and everyone else keep being
-- asked to invite a door shop.
--
-- A sixth terminal state, because the reason matters when the numbers are
-- read later: this campaign did not fail, and nobody declined it — it should
-- never have been opened, and the rule that would have stopped it now exists.
ALTER TABLE invite_campaigns DROP CONSTRAINT IF EXISTS invite_campaigns_status_check;
ALTER TABLE invite_campaigns ADD CONSTRAINT invite_campaigns_status_check
  CHECK (status IN ('open', 'closed_joined', 'closed_declined_all', 'closed_exhausted',
                    'closed_no_inviters', 'closed_expired', 'closed_stale_target'));

COMMENT ON COLUMN invite_campaigns.status IS
  'open | closed_joined | closed_declined_all | closed_exhausted | closed_no_inviters | closed_expired | closed_stale_target (the target list no longer chooses this target)';
