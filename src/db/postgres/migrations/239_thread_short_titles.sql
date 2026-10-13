-- 4919 (Giorgi, 13 Oct): every case in the three tabs needs a title that fits —
-- two or three words on a desktop, one word on a phone. The full title stays.
-- NULL until written (the switch SHORT_TITLES_ON); the client then shortens
-- the full title itself.
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS short_title TEXT CHECK (short_title IS NULL OR length(short_title) <= 40),
  ADD COLUMN IF NOT EXISTS one_word_title TEXT CHECK (one_word_title IS NULL OR length(one_word_title) <= 24);
