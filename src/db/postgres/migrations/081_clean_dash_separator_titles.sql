-- Live-caught 25 Aug: 6 real thread titles carried a markdown-style "---"
-- separator the cheap title-generator model wrote alongside the actual
-- words (e.g. "განქორწინების იურიდიული დახმარება ---",
-- "ბათუმის ფოტოგრაფი --- კითხვა"). Hyphens are legitimately allowed in a
-- title (a real word can contain one), so sanitizeTitle's disallowed-char
-- filter never touched it, and it counted as one of the 4 kept words. Fixed
-- going forward in threadTitle.service.ts (a token with no letter in it is
-- dropped, same fix as the label parser's emoji filter); this is the
-- one-time cleanup for the titles already stored. Table is tiny (2,361
-- rows) — a plain scan, no batching needed.
UPDATE threads
SET title = trim(regexp_replace(regexp_replace(title, '(^|\s)-{2,}(\s|$)', '\1', 'g'), '\s+', ' ', 'g'))
WHERE title ~ '-\s*-\s*-';
