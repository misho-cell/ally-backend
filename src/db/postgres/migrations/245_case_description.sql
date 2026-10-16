-- 5413 (Giorgi, 16 Oct): the case-details panel shows a short description of the
-- case — what the owner wants, for whom, where it stands. Written by the server
-- after a run on a goal's conversation; NULL until the first one.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS case_description TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS case_description_at TIMESTAMPTZ;
