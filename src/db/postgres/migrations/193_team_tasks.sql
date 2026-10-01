-- M2 (plate v288, Misho's word 1 October): every task on the team's board says
-- who created it — Tornike / Giorgi / Lika / Ninia / AI (and Misho, who now
-- has a login of his own, §81).
--
-- There was no board in the base: the plate lived in the tester's file. This
-- is that board, with M4's five fields from the start (created by, problem,
-- task, priority, status) and M3's page (1 = waiting for Giorgi, 2 = at
-- Misho), so the next rows add pages, not a second migration.
CREATE TABLE IF NOT EXISTS team_tasks (
  id          SERIAL      PRIMARY KEY,
  created_by  TEXT        NOT NULL
              CHECK (created_by IN ('tornike', 'giorgi', 'lika', 'ninia', 'misho', 'ai')),
  -- The login the server saw, kept beside the author it decided.
  posted_by   TEXT        NOT NULL,
  problem     TEXT        NOT NULL,
  task        TEXT        NOT NULL,
  priority    SMALLINT    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status      TEXT        NOT NULL DEFAULT 'to_build'
              CHECK (status IN ('to_build', 'built', 'being_tested', 'tested')),
  page        SMALLINT    NOT NULL DEFAULT 1 CHECK (page IN (1, 2)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_tasks_page ON team_tasks (page, priority, id);
