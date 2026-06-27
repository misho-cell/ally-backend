CREATE TABLE "UserBlock" (
  id             SERIAL  PRIMARY KEY,
  "blockerId"    INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "blockedPhone" TEXT    NOT NULL,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("blockerId", "blockedPhone")
);

CREATE INDEX idx_user_block_blocker ON "UserBlock" ("blockerId");
CREATE INDEX idx_user_block_phone   ON "UserBlock" ("blockedPhone");
