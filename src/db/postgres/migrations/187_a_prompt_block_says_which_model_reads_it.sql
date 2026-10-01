-- ROW 290 — A PROMPT OF GPT'S OWN, EDITED THE SAME WAY AS CLAUDE'S.
--
-- Claude runs the agent and its prompt lives in these blocks. Since the hybrid,
-- GPT writes the final Georgian text — and had no prompt of its own: it only
-- ever saw Claude's, flattened. Misho, 1 October: a GPT prompt, added and
-- corrected in the admin console exactly as Claude's is, with one selector
-- saying which model a block is for.
--
-- So a block now says which model reads it. Every existing block is Claude's,
-- which is what the default makes true; nothing that runs today changes.
ALTER TABLE prompt_blocks
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE prompt_block_history
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'claude';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prompt_blocks_model_known') THEN
    ALTER TABLE prompt_blocks
      ADD CONSTRAINT prompt_blocks_model_known CHECK (model IN ('claude', 'gpt'));
  END IF;
END $$;
