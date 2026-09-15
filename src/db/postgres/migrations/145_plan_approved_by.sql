-- Ticket 19 item 0, the third part: every „გეგმა დამტკიცდა" names who did it.
--
-- The timeline built that line from `plan_approved_at` alone — a time, with
-- nobody attached. So when a wake approved a plan itself on 14 September, the
-- entry it wrote was indistinguishable from the founder pressing the button:
-- the only way anyone told them apart afterwards was by reading the whole
-- thread and noticing that no human line sat next to it.
--
-- A wake can no longer approve anything. That is the fix; this is the receipt.
-- An entry that cannot say who made it is an entry you have to trust, and the
-- point of a timeline is not having to.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_approved_by TEXT;

-- HOW the approval arrived: 'chat' (the owner's own session) or 'admin' (the
-- panel, where the operator is named separately in the admin register). Null
-- on every row approved before this column existed — and null means UNKNOWN,
-- never „the owner": the rows from before cannot be made honest retroactively,
-- so they say nothing rather than claim something.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_approved_via TEXT;
