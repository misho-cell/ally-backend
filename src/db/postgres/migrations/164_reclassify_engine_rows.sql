-- §20 — 26 engine turns that have been drawn as ordinary chat messages since
-- 10 August, all of them in the founder's own account.
--
-- Authorised by Misho, 21 September, on the registered §20 entry: „გააკეთე
-- როგორც ამბობ."
--
-- WHAT THEY ARE. Engine turns go into the thread as `role: 'user'` so the model
-- has them in its history, and carry `kind: 'event'` so the client never draws
-- them (`getThreadMessages` filters by kind). These 26 carry `kind = 'message'`,
-- which is exactly what the filter lets through, so they read as if the owner
-- had typed the engine's instruction to itself in their own voice.
--
-- WHY EXACTLY 26 AND WHY THE NUMBER IS NOT GROWING. They are 10-11 August. The
-- first row ever written with `kind = 'event'` is 11 August 13:28:49 and the
-- last mis-kinded one is 12:07:24 the same day — the kind was introduced that
-- lunchtime and the 850 rows since are all correct.
--
-- NOT A ROUTE, WHICH IS A CHANGE FROM WHAT §20 REGISTERED. I wrote it up as
-- `POST /admin/conversations/reclassify-engine-rows`, and then argued myself
-- out of it twice today in other people's rows: a route nobody calls is a
-- guard standing on the wrong path. This is a one-off correction with a fixed,
-- knowable scope, which is what a migration is for — it runs once, it is in
-- git where anyone can read it, and it leaves no admin power behind it.
--
-- NO CONTENT CHANGES. The text stays byte for byte and the admin window still
-- shows it word for word; the only thing that moves is whether a chat draws it.
-- That is why this was worth offering where §18's redaction was not.
--
-- UNDO: the same statement with the kinds swapped —
--   UPDATE conversations SET kind = 'message'
--   WHERE kind = 'event' AND (content LIKE '[მოვლენა]%' OR content LIKE '[სისტემა]%')
--     AND created_at < '2026-08-11 13:00:00+00';
-- The date bound is what keeps an undo from claiming the 850 legitimate rows.
UPDATE conversations
SET kind = 'event'
WHERE kind = 'message'
  AND (content LIKE '[მოვლენა]%' OR content LIKE '[სისტემა]%');
