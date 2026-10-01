-- ROW 305 (b) / D530 — A FOLLOW-UP REQUEST STAYS IN THE CONVERSATION.
--
-- Goal 11323: Netai Test 65 asked Netai Test 68 about an electrician (ask
-- thread 26997), then asked the same person, for the same goal, to introduce
-- the electrician — and the request opened thread 27194 beside it. Row 305 (a)
-- made each thread point at the other. Tornike's decision is the real fix: „a
-- follow-up introduction request between the same people about the same goal
-- continues their EXISTING conversation."
--
-- So such a request opens no thread of its own. It is written into the
-- mediator's ask thread and into the requester's goal thread, and these two
-- columns say which threads those are.
--
-- ⚠️ WHY NOT `threads.introduction_request_id`. That column links a thread to
-- ONE request and means „this thread IS the request". An ask thread that
-- carries a request is still an ask thread — it holds the ask AND the request —
-- and a goal thread is the goal's. Pointing from the request to the thread
-- keeps both facts true and leaves every existing reader of that column alone.
--
-- NULLABLE, no default, no backfill: every request written before today has
-- its own two threads, linked the old way, and NULL here is the truth about it.
--
-- ON DELETE SET NULL: deleting a conversation (`deleteThread`, Lika's D23) must
-- keep working. The request outlives the chat it was shown in, exactly as it
-- does when an old-style request thread is deleted.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS mediator_thread_id INTEGER REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS requester_thread_id INTEGER REFERENCES threads(id) ON DELETE SET NULL;

-- Read per thread on the sidebar (the pending request's ref) and per run (is a
-- request waiting in this conversation), so by the thread id. Partial: almost
-- every request has neither, and those rows do not belong in either index.
CREATE INDEX IF NOT EXISTS introduction_requests_mediator_thread_idx
  ON introduction_requests (mediator_thread_id)
  WHERE mediator_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS introduction_requests_requester_thread_idx
  ON introduction_requests (requester_thread_id)
  WHERE requester_thread_id IS NOT NULL;

COMMENT ON COLUMN introduction_requests.mediator_thread_id IS
  'The mediator''s existing ask thread this request was written into (row 305 b). '
  'NULL when the request has its own incoming_request thread.';
COMMENT ON COLUMN introduction_requests.requester_thread_id IS
  'The requester''s goal thread this request was written into (row 305 b). '
  'NULL when the request has its own outgoing_request thread.';
