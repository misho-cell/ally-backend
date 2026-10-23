-- 264: #7591 (frontend 23 Oct 23:40Z): a sent card keeps the text that actually went — the
-- founder's edit or the draft — so the record shows what the person received.
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS sent_text TEXT;
