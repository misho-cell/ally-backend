-- Which search tool produced the activity (name / tag / insight / second_degree),
-- so admin reporting can break usage down by search type.
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS tool TEXT;
