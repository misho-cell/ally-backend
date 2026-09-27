-- ⚠️ TWO DIFFERENT FACTS HAVE BEEN LOOKING IDENTICAL FROM THE SERVER, AND ONE
-- OF THEM IS OUR BUG WHILE THE OTHER IS SOMEBODY'S DECISION.
--
-- „This account has no push subscription" is what the database can say today.
-- It is true of a person who was never asked, of a person who said no, of an
-- iPhone in a Safari tab where push is physically impossible, and of a person
-- who said YES and whose registration then failed. The first and the last are
-- ours to fix; the second is to be respected and answered with instructions
-- rather than code; the third is not a fault at all.
--
-- Row 276. We hit that wall twice on 26 September, and again that night: the
-- tester reported „an incoming request brings no notification" on a phone, and
-- finding out why took reading four subscription rows by hand — the answer was
-- that Lika's account has NO iPhone subscription at all while Salome's has
-- two. That should have been a read, not an investigation.
--
-- WHAT IS STORED, AND WHAT IS DELIBERATELY NOT.
--
-- The browser is the only party that knows any of this, so it tells us: one
-- word for the permission, and whether the app is running from the home screen.
-- `standalone` is here because on iOS a home-screen app and a Safari tab send
-- the SAME user agent — the thing we actually need to know is not in the user
-- agent, and `standalone` is.
--
-- NO user_agent. The front end proposed leaving it out and they are right:
-- it does not answer the question it looks like it answers, and the less we
-- keep about a person's device the less there is to explain.
--
-- ONE ROW PER ACCOUNT, overwritten. This is a current state, not a history —
-- „what is true of this person's browser now". The one piece of history worth
-- keeping is `state_since`, because „denied" matters differently on its first
-- day and in its second week, and a person who has said no for a fortnight is
-- not somebody to ask again.
CREATE TABLE IF NOT EXISTS notification_state (
  user_id INTEGER PRIMARY KEY,
  -- unasked | denied | granted | needs_pwa | unsupported
  state TEXT NOT NULL,
  -- NULL when the browser did not say. A missing answer is not a false one.
  standalone BOOLEAN,
  -- When this STATE began. Untouched by a report that says the same thing.
  state_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When we last heard anything at all, whether or not it changed.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The only question this table is asked: how many accounts are in each state.
CREATE INDEX IF NOT EXISTS notification_state_by_state ON notification_state (state);
