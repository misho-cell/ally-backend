-- 1882 / the frontend's 06:30Z item 10: the setup list ('2 of 5 done') per
-- person AND per gadget. A step the person marks on one gadget (Done / It
-- didn't work / Later) is that gadget's; the server's own ticks (contacts in,
-- a push subscription, the connector) are read live and never stored here.
CREATE TABLE IF NOT EXISTS setup_steps (
  user_id    INTEGER     NOT NULL,
  device_id  TEXT        NOT NULL CHECK (char_length(device_id) BETWEEN 1 AND 64),
  gadget     TEXT        NOT NULL CHECK (gadget IN ('iphone', 'android', 'windows', 'mac', 'other')),
  step       TEXT        NOT NULL
             CHECK (step IN ('install', 'notifications', 'contacts', 'freshness', 'connector')),
  status     TEXT        NOT NULL CHECK (status IN ('done', 'failed', 'later')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id, step)
);

-- The admin funnel reads by gadget and step.
CREATE INDEX IF NOT EXISTS setup_steps_by_gadget ON setup_steps (gadget, step, status);
