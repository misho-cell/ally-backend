-- 116: which VERSION of a block answered a turn (ticket 9 task 34).
--
-- `run_prompt_stamps` already records the mode and the block NAMES a run
-- loaded. That answers "which block", not "which text": `task_main` has been
-- edited five times, and a stamp saying „task_main" cannot tell a tuning round
-- from the round before it. The prompt team's whole loop — change the block,
-- watch the next replies — depends on knowing which revision spoke.
--
-- The block's own `updated_at` IS its version: every save moves it and writes
-- a history row with the same moment. So a stamp of „task_main@2026-09-02T13:04"
-- names the exact text, and joins to prompt_block_history by name and time.
ALTER TABLE run_prompt_stamps ADD COLUMN IF NOT EXISTS block_versions TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN run_prompt_stamps.block_versions IS
  'name@ISO-updated_at per loaded block — the exact revision that ran (ticket 9 task 34).';
