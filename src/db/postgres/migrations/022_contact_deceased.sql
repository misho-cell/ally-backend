-- Contacts the user has marked as deceased. Hidden from that user's searches
-- and introduction suggestions, so the assistant never proposes reaching them.
CREATE TABLE IF NOT EXISTS "ContactDeceased" (
  id          SERIAL  PRIMARY KEY,
  "userId"    INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  phone       TEXT    NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", phone)
);

CREATE INDEX IF NOT EXISTS idx_contact_deceased_user ON "ContactDeceased" ("userId");
