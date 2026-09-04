-- 111: where an ask was actually sent FROM (ticket 9 task 20 d).
--
-- Ask 727 is filed against goal 1519 („ლიკა ოსეფაშვილთან გაცნობა"), and its
-- question is „ვინმეს იცნობ, ვინც ბურიტოს კარგად ამზადებს? პირადი მზარეული
-- მჭირდება." Nothing in the row explains the mismatch, and answering it took a
-- reconstruction from message timestamps across two threads: the founder asked
-- for the burrito cook in thread 9412, which had no goal of its own, so the
-- model reached for the one open goal that named the same person and passed
-- 1519 as ask_contact's task_id.
--
-- An ask must belong to a goal — that is where consent, the daily budget, the
-- debrief and the answer's route back all live. What was missing is the other
-- half of its provenance: the conversation it came out of. `ask_thread_id` is
-- the RECIPIENT's thread; this is the sender's.
--
-- Rows written before today keep NULL. A hand-filled value among them would
-- read as evidence the database does not have — 727's origin is in the letter
-- instead, where it can carry its reasoning.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS origin_thread_id INTEGER;

COMMENT ON COLUMN task_asks.origin_thread_id IS
  'The sender-side thread the ask was sent from (ask_thread_id is the recipient side). NULL before migration 111.';
