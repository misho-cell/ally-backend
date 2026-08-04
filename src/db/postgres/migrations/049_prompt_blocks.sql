-- Prompt blocks: the system prompt stops being one monolith. A run is
-- composed as base (ai_config) + strategy + the blocks for ITS run mode, so
-- a deep-research instruction weighs only on deep-research runs and can grow
-- without degrading quick answers. Content is edited from the admin API
-- (no deploy); an absent block is simply skipped — deploying this changes
-- nothing until texts are written.
CREATE TABLE IF NOT EXISTS prompt_blocks (
  name       TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
