-- 5347 (the founder's word, 16 Oct; tester 61837): a link who does not know the
-- target passes the owner's request on to someone who does. The request stays
-- the owner's; this is the link whose assistant passed it on, so the next person
-- reads who it came through. NULL for every request asked first-hand.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS forwarded_by_user_id INTEGER REFERENCES "User"(id);
