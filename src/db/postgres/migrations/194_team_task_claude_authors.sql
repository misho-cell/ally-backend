-- The tester's 977 (D558): the tester's finds are stamped „Tornike's Claude",
-- and Giorgi's own Claude „Giorgi's Claude". With only „ai" the two could not
-- be told apart on page 1, so each is its own author.
ALTER TABLE team_tasks DROP CONSTRAINT IF EXISTS team_tasks_created_by_check;
ALTER TABLE team_tasks ADD CONSTRAINT team_tasks_created_by_check
  CHECK (created_by IN ('tornike', 'giorgi', 'lika', 'ninia', 'misho', 'ai',
                        'tornikes_claude', 'giorgis_claude'));
