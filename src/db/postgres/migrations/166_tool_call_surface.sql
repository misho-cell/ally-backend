-- A tool call made through the CONNECTOR could not be written down at all.
--
-- The tester's observation, 21 September: `mcpServer.runTool` writes the cost
-- ledger and does not write this table. The chat's calls are recorded; the
-- connector's are not.
--
-- WHY IT COULD NOT BE: `thread_id` is NOT NULL, and a connector call has no
-- thread. It is somebody in Claude, or another MCP client, asking the product
-- a question outside any conversation. So the column that made the table
-- readable („this thread, in order") is the same column that made half the
-- product invisible in it.
--
-- WHAT IT COST ME, which is why this is worth a migration: for three days I
-- have taken numbers out of this table and called them „every call" when what
-- I had was „every CHAT call". On 21 September alone that same substitution —
-- a table showing me a part and my reading it as the whole — happened three
-- times: the way-in searches, the phase rows in the readiness gate, and this.
--
-- AND THE NUMBERS ON EITHER SIDE OF THIS MIGRATION ARE NOT COMPARABLE. A count
-- of calls per day rises from today for a reason that is not usage. `surface`
-- is what makes an old number and a new one answerable in the same query, so
-- it is explicit rather than derived from `thread_id IS NULL` — a meaning that
-- has to be remembered is one that gets forgotten.
ALTER TABLE tool_call_log ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE tool_call_log ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'chat';

-- Every row written before today is a chat call by construction — the
-- connector's could not be written — so the default is right for the backfill
-- and no UPDATE is needed.

-- „All the connector calls, newest first" is the read this exists for, and it
-- cannot use the thread index.
CREATE INDEX IF NOT EXISTS idx_tool_call_log_surface ON tool_call_log (surface, id);
