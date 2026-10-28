-- 282: #8317 (desk C-32c, founder's priority 1). The admin could not download a
-- file a member uploaded: only the read rows were kept (one sheet, rows cut), so
-- Giorgi's company list on sheet 2 was gone with the bytes. The upload itself is
-- kept from now on, with its type. It is the owner's own, like the rows, and goes
-- with the conversation (ON DELETE CASCADE on thread_files).
ALTER TABLE thread_files ADD COLUMN IF NOT EXISTS original BYTEA;
ALTER TABLE thread_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
CREATE INDEX IF NOT EXISTS thread_files_user_idx ON thread_files (user_id, created_at DESC);
