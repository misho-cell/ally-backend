-- Ticket 19 G7: what a run actually called, readable from the admin seat.
--
-- WHY THIS EXISTS. /admin/threads/<id>/messages gives role, kind, run_id,
-- prompt_mode, prompt_blocks and choices — everything the model SAID, and
-- nothing it DID. So „did it search the second circle, and what came back"
-- could only be guessed from the step captions, and on thread 15346 the step
-- captions disagreed with each other inside eight minutes: „the second circle
-- is empty", then „the second circle shows craftsmen Ketevan knows", then
-- „both circles are empty". No one could say which of the three was true,
-- because the evidence was never written down anywhere.
--
-- search_activity already logs searches, but with neither thread_id nor
-- run_id — only user and time — so it cannot answer a question asked about one
-- thread. This table is keyed the way the question is asked.
--
-- WHAT A ROW IS NOT. It is not the tool's arguments and it is not its result.
-- Both are summarised down to what the question needs (D149: a phone appears
-- as its last four digits and never in full), because this is a debugging
-- record read by people, not a second copy of the conversation.
CREATE TABLE IF NOT EXISTS tool_call_log (
  id            SERIAL PRIMARY KEY,
  thread_id     INTEGER NOT NULL,
  run_id        TEXT,
  user_id       TEXT,
  tool          TEXT NOT NULL,
  -- A short, redacted rendering of what was passed in.
  args_summary  TEXT,
  -- How much came back: the tool's own count where it has one, otherwise NULL.
  result_count  INTEGER,
  -- Whether anything came back at all, which is the question actually being
  -- asked („the second circle is empty") and is not always the same as a count.
  result_empty  BOOLEAN,
  -- The serialised result's size in characters. A cheap, honest stand-in for
  -- „how much" when a tool reports no count of its own.
  result_chars  INTEGER,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The read is always „this thread, in order".
CREATE INDEX IF NOT EXISTS idx_tool_call_log_thread ON tool_call_log (thread_id, id);
