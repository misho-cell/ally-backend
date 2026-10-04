-- Board #892 / #895 (the founder, 4 October): a file the owner gives Netai —
-- a list of companies in Excel, a CSV, a text — stays with the conversation it
-- was given in.
--
-- What is kept is what was READ, never the original bytes: the columns, the
-- rows and the plain text, each already bounded by listFile.ts. The file is the
-- owner's private material (#895): it belongs to one conversation, nobody else
-- reads it, and it goes when the conversation goes (ON DELETE CASCADE — and an
-- account's deletion deletes its conversations).
CREATE TABLE IF NOT EXISTS thread_files (
  id           SERIAL PRIMARY KEY,
  thread_id    INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL,
  filename     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  columns      JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows         JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows_cut     BOOLEAN NOT NULL DEFAULT FALSE,
  text_content TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS thread_files_thread_idx ON thread_files (thread_id, created_at DESC);
