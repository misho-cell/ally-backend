-- 263: #7591 WAR ROOM steps 5-6 (founder, 24 Oct): a card carries the draft written for it
-- (until the per-card workers exist, NETAI 23 writes it from the chat), and, once the founder
-- approves, the Netai message that sent it (#7360). Nothing is sent without that approval (D881).
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS draft TEXT;
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS draft_by TEXT;
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS draft_at TIMESTAMPTZ;
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS sent_message_id INTEGER;
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS sent_by TEXT;
ALTER TABLE war_room_cards ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
