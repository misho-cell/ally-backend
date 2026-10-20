-- #6172 (launch 21 Oct; Lika's ask via the founder): a GUEST LIST of numbers
-- approved ahead of time, by group (Axel, later CELA). A listed number passes
-- the invite-only gate as invited by the group's inviter, skips the payment
-- page, and its free days start at its FIRST successful sign-in.
CREATE TABLE IF NOT EXISTS guest_list (
  id               SERIAL PRIMARY KEY,
  phone_digits     TEXT NOT NULL UNIQUE,
  group_name       TEXT NOT NULL CHECK (length(group_name) BETWEEN 1 AND 40),
  free_days        INTEGER NOT NULL DEFAULT 20 CHECK (free_days BETWEEN 1 AND 90),
  inviter_user_id  INTEGER,
  added_by         TEXT NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          INTEGER,
  first_signin_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_guest_list_group ON guest_list (group_name);
