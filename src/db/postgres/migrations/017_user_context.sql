-- Public profile: flexible key-value rows (replaces JSONB user_profiles)
CREATE TABLE IF NOT EXISTS user_profile_kv (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

-- Migrate existing JSONB data into KV rows
INSERT INTO user_profile_kv (user_id, key, value)
SELECT user_id::TEXT, kv.key, kv.value
FROM user_profiles,
LATERAL jsonb_each_text(profile_data) AS kv(key, value)
ON CONFLICT (user_id, key) DO NOTHING;

-- Private context: same structure, strictly confidential
CREATE TABLE IF NOT EXISTS user_private_context (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);
