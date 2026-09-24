-- WHEN DID THIS BROWSER LAST SAY „I AM STILL HERE" — row 101, the half that
-- was missing.
--
-- ════════ THE PROBLEM THIS SOLVES, STATED EXACTLY ════════
--
-- One notification goes to EVERY row in `push_subscriptions` for a person, so
-- a row left behind by a browser that no longer exists makes every
-- notification arrive twice. Two accounts carry such rows today: 160584 has
-- five endpoints, 501 has three.
--
-- The server cannot tell a dead row from a live one. Measured on 24 September
-- across fourteen days of `push_deliveries`: `failed = 0` on every endpoint on
-- every day, INCLUDING two that visibly stopped existing. Apple and Google
-- accept a push to a dead address and answer „delivered". A row only ever dies
-- on a 404 or a 410, and those two have never said either.
--
-- `previous_endpoint` (ef5f173) fixed the case where a browser changes its
-- endpoint while it is running: it names the row it replaces and the server
-- deletes exactly that one. IT CANNOT REACH ROWS WRITTEN BEFORE IT, because
-- the browser that wrote them may never come back — an old install, a deleted
-- home-screen app. Nobody will ever name those.
--
-- ════════ WHY A TIMESTAMP IS A FACT AND NOT A GUESS ════════
--
-- `savePushSubscription` already backfills `device_id` and `user_agent` on a
-- re-subscribe (COALESCE on conflict), so the server DOES hear from a browser
-- that is still in use. It simply never wrote down when. With this column it
-- does, and then the dangerous question becomes answerable WITHOUT guessing:
--
--     retire a row only when it has not been claimed for a long time
--     AND ANOTHER ROW FOR THE SAME PERSON HAS BEEN CLAIMED RECENTLY.
--
-- The second half is what makes it safe. It proves, for that person, that
-- claims are arriving at all — so „this one is silent" means the browser is
-- gone and not that the client never reports. Without it, a client that posts
-- only on a NEW subscription would make every row look dead and the rule would
-- delete somebody's only phone. The evidence has to come from the same person,
-- because that is the only place it cannot be wrong about.
--
-- Nothing here deletes anything. It records a date so that a later deletion can
-- be a fact with a reason, decided by a person, in the register (D44).
--
-- ════════ AND IT IS SELF-HEALING IF IT IS EVER WRONG ════════
--
-- Deleting a row that turns out to be live costs that device its notifications
-- until the person next opens the app — at which point it re-registers like
-- any new device. That is the bounded, recoverable direction, and it is worth
-- writing down before anybody presses anything.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Seeded from creation, not from NOW(): a row that has never been re-claimed
-- must not look as though it was claimed the minute this migration ran. That
-- would erase the very difference the column exists to record, on exactly the
-- four rows it was built for.
UPDATE push_subscriptions
   SET last_seen_at = created_at
 WHERE last_seen_at IS NULL;
