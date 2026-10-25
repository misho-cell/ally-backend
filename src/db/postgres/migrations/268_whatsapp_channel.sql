-- 268: WhatsApp as a second channel (Misho, 25 Oct: "users struggle to see the
-- notifications and use WhatsApp more"). A person opts in from their profile;
-- nothing is sent to anyone who has not.

-- One row per person who has ever chosen: their current choice and when.
CREATE TABLE IF NOT EXISTS whatsapp_consent (
  user_id      INTEGER PRIMARY KEY,
  opted_in     BOOLEAN NOT NULL,
  opted_in_at  TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  source       TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every message through the channel, in and out, without its text: the
-- provider's id (so a reply to one of ours finds its conversation), the
-- conversation, and when. The last inbound row opens WhatsApp's 24-hour window.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  wamid       TEXT UNIQUE,
  thread_id   INTEGER,
  kind        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user_time
  ON whatsapp_messages (user_id, direction, created_at DESC);

-- A WhatsApp message that came due in the person's quiet hours waits for their
-- morning, as a push does; it is sent then, or dropped if they opted out meanwhile.
CREATE TABLE IF NOT EXISTS whatsapp_held (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  text       TEXT NOT NULL,
  thread_id  INTEGER,
  release_at TIMESTAMPTZ NOT NULL,
  sent_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_held_due
  ON whatsapp_held (release_at) WHERE sent_at IS NULL;
