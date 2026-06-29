-- Device fingerprints for abuse detection. The app sends a stable X-Device-Id
-- header; we record it alongside user-agent and IP per user.
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  user_agent    TEXT,
  ip            TEXT,
  request_count INTEGER NOT NULL DEFAULT 1,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_device ON device_fingerprints (device_id);
