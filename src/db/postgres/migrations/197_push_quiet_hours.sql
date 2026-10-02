-- Push quiet hours (Giorgi's decision, 2 October; team task 200): no push
-- between 23:00 and 09:30 in the recipient's local time; what falls in that
-- window is held here and sent at 09:30.
--
-- time_zone is the DEVICE's own (the phone says it when it subscribes). NULL
-- means it has not said, and Tbilisi is used.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS time_zone TEXT;

-- One row per device per distinct notification: the same words held twice for
-- one device are one push in the morning, not two (payload_key, unique).
CREATE TABLE IF NOT EXISTS held_pushes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  endpoint    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  payload_key TEXT NOT NULL,
  release_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint, payload_key)
);
CREATE INDEX IF NOT EXISTS idx_held_pushes_release ON held_pushes (release_at);
