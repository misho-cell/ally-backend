-- The frontend's item 3 (Misho's yes, 14 Oct): the owner names their own
-- assistant („ჩემი ასისტენტი"). NULL means the default name. The model does not
-- read it yet: that is a new text in the prompt and waits for Misho's yes (D44).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS assistant_name TEXT
  CHECK (assistant_name IS NULL OR length(assistant_name) <= 40);
