-- 1698 (A15, D679/D680): what a member is OPEN TO, said in the chat and
-- confirmed in one line („I'll note you're open to hospitality asks from
-- Axel — right?"). Read only by pre-matching (A11), bridge choice (A14) and
-- the nightly matcher (A16). Never answers anyone, never shown to another
-- user. „Forget that" sets active FALSE; the row stays for the admin page.
CREATE TABLE IF NOT EXISTS offers (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL,
  text        TEXT        NOT NULL,
  field       TEXT,
  source      TEXT        NOT NULL DEFAULT 'chat',
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offers_user_active ON offers (user_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_offers_field_active ON offers (field) WHERE active;
