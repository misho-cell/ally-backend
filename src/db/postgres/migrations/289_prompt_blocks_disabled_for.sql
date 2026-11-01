-- #8482: a live block can be switched OFF for listed accounts, so a whole
-- improved prompt can be tested on test seats while real members keep the
-- live blocks. Empty list = today's behaviour.
ALTER TABLE prompt_blocks
  ADD COLUMN IF NOT EXISTS disabled_for_user_ids INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE prompt_block_history
  ADD COLUMN IF NOT EXISTS disabled_for_user_ids INTEGER[] NOT NULL DEFAULT '{}';
