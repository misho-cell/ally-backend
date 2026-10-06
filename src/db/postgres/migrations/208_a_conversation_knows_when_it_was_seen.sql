-- #1817 (Ninia, the frontend's 11:30Z): a conversation moved to the finished
-- ones before its owner had seen the answer. The app now keeps a goal on top
-- until it is opened, and „opened" has to live on the server: an answer read
-- on a laptop has been read, and a per-device mark would show it as new on
-- the phone forever. POST /threads/:id/seen stamps it; GET /threads carries it.
--
-- NULL means never opened, so every existing conversation is stamped now.
-- Left NULL, every old finished goal would climb to the top of the list at
-- once — a worse fault than the one reported.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
UPDATE threads SET seen_at = NOW() WHERE seen_at IS NULL;
