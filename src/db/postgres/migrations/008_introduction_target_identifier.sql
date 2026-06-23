ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS target_user_id INTEGER REFERENCES "User"(id),
  ADD COLUMN IF NOT EXISTS target_phone   TEXT;
