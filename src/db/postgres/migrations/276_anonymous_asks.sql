-- 276 (#7856): an ask the owner wants unnamed („one guy is looking for…").
-- The reader sees no name in the opening, the title, the push or the question;
-- a follow-up in the same thread stays unnamed until the owner says otherwise.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS anonymous BOOLEAN NOT NULL DEFAULT FALSE;
