-- 280: #7659 (tester 77420, 28 Oct): a second ask to a person who has not opened
-- the first is held — and was simply refused, so nothing was left to send once
-- they did open it. The held question is kept here and sent when they read the
-- earlier message. Its own table: held_asks already holds the budget holds,
-- which are released by time, not by a read.
CREATE TABLE IF NOT EXISTS pace_held_asks (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER     NOT NULL,
  from_user_id  INTEGER     NOT NULL,
  to_user_id    INTEGER     NOT NULL,
  contact_phone TEXT        NOT NULL,
  question      TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at   TIMESTAMPTZ,
  outcome       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pace_held_asks_waiting
  ON pace_held_asks (to_user_id, from_user_id) WHERE released_at IS NULL;
