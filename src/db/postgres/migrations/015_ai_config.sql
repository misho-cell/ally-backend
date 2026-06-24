CREATE TABLE IF NOT EXISTS ai_config (
  id           SERIAL PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
