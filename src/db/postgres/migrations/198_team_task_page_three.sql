-- Board #463 (Giorgi, 2 October): a third tab, „თორნიკეს Claude-თან" — the
-- prompt work the tester seat takes, apart from the rows waiting for Giorgi's
-- order. Page 3 joins 1 (Giorgi) and 2 (Misho); no row moves on its own.
ALTER TABLE team_tasks DROP CONSTRAINT IF EXISTS team_tasks_page_check;
ALTER TABLE team_tasks ADD CONSTRAINT team_tasks_page_check CHECK (page IN (1, 2, 3));
