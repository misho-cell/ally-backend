-- Ticket 20 row 210 — the goal an introduction was asked FOR.
--
-- The seat's run of 18 September: Salome asked to be introduced to Ninia at
-- 13:35, Lika agreed at 13:41, and Salome's own goal thread said nothing until
-- she typed „arapheria akhali?" at 14:06:46 and it was read back to her at
-- 14:07:09. Twenty-six minutes with the answer already in the system.
--
-- Her push went (two, 13:41:00) and the request's own thread was written to.
-- What was never told is the GOAL — the thread she was living in, which stayed
-- on „ველოდები" throughout, because nothing connects a request to the goal it
-- was raised for. An answered ask wakes its goal; an answered introduction had
-- nothing to wake.
--
-- Nullable and unconstrained on purpose. Every request written before today
-- has no goal recorded and never will, and a request can legitimately be
-- raised in a conversation with no goal at all — an absent link must read as
-- „no goal", not as a broken one.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS requester_task_id INTEGER;

-- Read only on resolve, one request at a time, so the lookup is by primary key
-- and this column needs no index of its own.
COMMENT ON COLUMN introduction_requests.requester_task_id IS
  'The requester''s open goal this introduction was raised for, when there was one (row 210).';
