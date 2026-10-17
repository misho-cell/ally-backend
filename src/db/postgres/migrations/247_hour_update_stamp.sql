-- 247: #5249 / D800 (founder's yes and Misho's, 17 Oct). A goal that has
-- found nobody who answered within its first hour gets one honest update
-- with a realistic next step. Once per goal — which is what this stamp is for.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hour_update_woken_at TIMESTAMPTZ;
