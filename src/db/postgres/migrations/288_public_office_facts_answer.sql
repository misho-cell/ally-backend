-- #8350 item 4, tester 79546: the kept fact answered as a bare record with no
-- official contact. The first answer's own text (its people, the official
-- contact it gave, in Netai's voice) is kept with the fact and said again,
-- with the day it was checked.
ALTER TABLE public_office_facts ADD COLUMN IF NOT EXISTS answer_text TEXT;
