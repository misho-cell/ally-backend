-- Board #893 (the founder, 4 October): „it is not only uploading — it is using
-- it and working with it." Every row of a list the owner gave Netai becomes an
-- item of ONE goal, with its own way in and its own state.
--
--   way_in   first_circle — a contact of the owner's is tied to this row
--            none         — looked, nobody in the owner's own contacts
--            unchecked    — the lookup did not finish; never read as „nobody"
--   state    route_found / no_route / unchecked now; asked, answered, agreed
--            and refused as the work goes on
--
-- The items belong to the goal and to the file, and go with either.
CREATE TABLE IF NOT EXISTS list_items (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  thread_file_id  INTEGER NOT NULL REFERENCES thread_files(id) ON DELETE CASCADE,
  row_index       INTEGER NOT NULL,
  label           TEXT NOT NULL,
  row_data        JSONB NOT NULL DEFAULT '[]'::jsonb,
  way_in          TEXT NOT NULL,
  through_whom    TEXT,
  state           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, thread_file_id, row_index)
);

CREATE INDEX IF NOT EXISTS list_items_task_idx ON list_items (task_id, state);
