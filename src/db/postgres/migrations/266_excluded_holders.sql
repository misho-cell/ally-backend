-- 266: accounts that never vouch for anyone (Misho, 24 Oct, on Misho's Claude's
-- recommendation; tester 75643/75644). 25 accounts, almost all +549 test accounts
-- made in April 2026 and never active in Netai, each carry a copy of one real
-- member's phonebook, so they "knew" everyone and crowded real bridges out of
-- second-degree lists. They are not deleted and nothing in them changes. They are
-- only never read as a bridge, a path link or a reverse-tie holder.
CREATE TABLE IF NOT EXISTS excluded_holders (
  user_id    INTEGER PRIMARY KEY,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO excluded_holders (user_id, reason)
SELECT id, 'copied_phonebook'
  FROM unnest(ARRAY[118542, 130092, 131248, 144051, 144282, 145008, 148738, 149793,
                    150981, 151113, 151114, 151115, 151245, 151311, 158637, 158673,
                    158703, 159099, 159165, 161013, 164181, 164214, 164643, 164874,
                    165039]) AS id
ON CONFLICT (user_id) DO NOTHING;
