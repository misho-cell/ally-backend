-- 248: #5611 (founder D808, 18 Oct 2026). An inviter's link can carry a limit:
-- at most max_joins registrations attributed to that inviter from counts_from
-- on, and none after ends_at. No row means no limit, as before. Rows are
-- written only through POST /admin/invite-link-limits (ADMIN_WRITE_OPERATIONS
-- §143).
CREATE TABLE IF NOT EXISTS invite_link_limits (
  inviter_user_id INTEGER PRIMARY KEY REFERENCES "User"(id),
  max_joins INTEGER NOT NULL CHECK (max_joins > 0),
  counts_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  board_row TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
