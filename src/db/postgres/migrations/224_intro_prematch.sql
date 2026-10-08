-- 1697 (A14, D679/D680): both sides of an introduction are pre-cleared at the
-- same moment — the bridge's word and the receiver's, from each one's own data
-- and the goal's words. Admin-only; the receiver is told nothing by it and
-- still hears of the request only after the bridge's yes (D438).
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS bridge_prematch TEXT;
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS receiver_prematch TEXT;
ALTER TABLE introduction_requests ADD COLUMN IF NOT EXISTS prematch_at TIMESTAMPTZ;
