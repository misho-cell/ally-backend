-- 249: #5744 (founder D822, 18 Oct 2026). Inside Claude or ChatGPT a member
-- asks for a link, opens it on the phone and picks the .vcf file; the file goes
-- straight to Netai, so no number passes through the AI. Each link is one use
-- and short-lived. Only the SHA-256 of the token is kept.
CREATE TABLE IF NOT EXISTS contact_upload_links (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "User"(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contact_upload_links_user ON contact_upload_links (user_id);
