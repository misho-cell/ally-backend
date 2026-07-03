-- OAuth 2.1 layer for the MCP connector (claude.ai custom connector, Stage 2).
-- Public clients only (PKCE, no client secret). Codes and tokens are stored as
-- SHA-256 hashes — a DB leak exposes nothing usable.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     TEXT PRIMARY KEY,
  client_name   TEXT,
  redirect_uris TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 SERIAL PRIMARY KEY,
  access_token_hash  TEXT UNIQUE NOT NULL,
  refresh_token_hash TEXT UNIQUE,
  client_id          TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  scope              TEXT,
  access_expires_at  TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens (user_id);
