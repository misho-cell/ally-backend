-- Prompt blocks v2: the prompt team owns the block CATALOG, not just the
-- texts. A block now carries its own mode bindings (which run situations it
-- joins), an order, an on/off switch, and an optional per-account trial list —
-- so blocks are created/retired from the admin console with no deploy.
-- History rows make every change reversible; run stamps make every run
-- explainable ("which mode resolved, which blocks loaded").

ALTER TABLE prompt_blocks
  ADD COLUMN IF NOT EXISTS modes                TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order           INTEGER   NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS enabled              BOOLEAN   NOT NULL DEFAULT TRUE,
  -- Empty = live for everyone; non-empty = a trial, live only for these
  -- accounts (the prompt team's canary mechanism).
  ADD COLUMN IF NOT EXISTS enabled_for_user_ids INTEGER[] NOT NULL DEFAULT '{}';

-- The three v1 blocks were implicitly bound to the mode of their own name —
-- make that binding explicit so behavior is unchanged.
UPDATE prompt_blocks
   SET modes = ARRAY[name]::TEXT[]
 WHERE modes = '{}'
   AND name IN ('quick_answer', 'request_thread', 'task_step');

-- Every create/update/delete snapshots the block, newest first; the service
-- trims to the last 10 per block. Rollback = PUT an old row's fields back.
CREATE TABLE IF NOT EXISTS prompt_block_history (
  id                   SERIAL PRIMARY KEY,
  block_name           TEXT      NOT NULL,
  action               TEXT      NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  content              TEXT      NOT NULL,
  modes                TEXT[]    NOT NULL DEFAULT '{}',
  sort_order           INTEGER   NOT NULL DEFAULT 100,
  enabled              BOOLEAN   NOT NULL DEFAULT TRUE,
  enabled_for_user_ids INTEGER[] NOT NULL DEFAULT '{}',
  changed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_block_history_name
  ON prompt_block_history (block_name, id DESC);

-- Which mode a run resolved to and which blocks it actually loaded — the
-- prompt team's request 5c: "a bad answer can't tell us 'the block is wrong'
-- from 'the wrong block loaded'". Pruned after 30 days.
CREATE TABLE IF NOT EXISTS run_prompt_stamps (
  run_id      TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  thread_id   INTEGER,
  mode        TEXT    NOT NULL,
  block_names TEXT[]  NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_prompt_stamps_created ON run_prompt_stamps (created_at);
CREATE INDEX IF NOT EXISTS idx_run_prompt_stamps_thread  ON run_prompt_stamps (thread_id);
