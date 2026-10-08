-- 1696 (A13, D679/D680): the person asked says „not me — ask Eka". The ask
-- remembers whom he named from his OWN phonebook, what he decided on the card
-- (approved / declined), and whether his name may go with it. The relayed ask
-- to Eka is an ordinary ask row with parent_ask_id set, as relays already are.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS referral_phone TEXT;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS referral_name TEXT;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS referral_offered_at TIMESTAMPTZ;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS referral_approved BOOLEAN;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS may_name_referrer BOOLEAN;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS referral_to_user_id INTEGER;
