-- 279: #1849 (Lika's FAIL, 27 Oct): the drawn path map (/paths/:id) is reached
-- only from a contact's page; the reply after find_warm_path named the bridges
-- in text and offered no way to it. The reply now carries the target's sealed
-- contact id, stored with the row so the link survives a reload, like share_text.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS path_map_id TEXT;
