-- How many results a search returned, so admin reporting can show search
-- effectiveness (success rate) per user and overall. NULL for rows logged
-- before this column existed.
ALTER TABLE search_activity ADD COLUMN IF NOT EXISTS result_count INTEGER;
