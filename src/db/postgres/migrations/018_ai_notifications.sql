-- AI-generated proactive push notifications (separate from system notifications)

CREATE TABLE IF NOT EXISTS ai_notification_log (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  push_sent  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_notification_log_user_idx
  ON ai_notification_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_notification_settings (
  user_id              TEXT PRIMARY KEY,
  frequency_days       INTEGER NOT NULL DEFAULT 1,
  last_sent_at         TIMESTAMPTZ,
  consecutive_no_opens INTEGER NOT NULL DEFAULT 0,
  paused               BOOLEAN NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
