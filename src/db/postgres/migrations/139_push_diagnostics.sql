-- Ticket 17 row 6, after the frontend's correction (build ed02255).
--
-- Two blind spots, both found by asking a question the data could not answer.
--
-- 1. WHICH DEVICE. `web.push.apple.com` serves macOS Safari as well as iOS, so
--    an Apple endpoint does not prove a phone ever registered — and the
--    frontend showed our own code cannot create one from an iPhone in a tab
--    (window.Notification is absent there, requestPermission is never called).
--    Lika's two Apple rows may well be her Mac, which fits the tester's own
--    words: "it arrives on the desktop, not on the phone". The subscription
--    now records what the browser said it is, so the question stops being
--    guesswork.
--
-- 2. WHETHER IT WAS DELIVERED. "sent or failed" existed only in the Railway
--    log, so every question of this shape needed log access and none could be
--    answered afterwards. Each attempt is now a row.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE TABLE IF NOT EXISTS push_deliveries (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  -- 'sent' | 'failed'. The web-push status code when the provider gave one;
  -- null for a transport error that never reached them.
  status      TEXT NOT NULL,
  status_code INTEGER,
  -- Truncated at the writer; a provider message, never user content.
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The only two reads this table is for: one user's recent attempts, and
-- "what is failing lately" across everyone.
CREATE INDEX IF NOT EXISTS idx_push_deliveries_user
  ON push_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_time
  ON push_deliveries (created_at DESC);
