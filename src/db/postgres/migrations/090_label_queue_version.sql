-- 090: Ticket 7 task 12 item 7 — every label-queue re-parse attempt is
-- stamped with the dictionary version that tried it (labelParser derives the
-- version from the dictionary's own content). A re-run with the same
-- dictionary skips rows it already failed on; a changed dictionary
-- automatically revisits the whole existing base. NULL = never re-tried
-- since this column existed. Additive nullable column: safe DDL.
ALTER TABLE label_parse_queue ADD COLUMN IF NOT EXISTS last_tried_version TEXT;
