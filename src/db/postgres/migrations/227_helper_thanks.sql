-- 1692 (A9, D679/D680): a „helped" debrief offers the asker one card — thank
-- the helper? — and one private tap — would you ask them again? One row per
-- answered ask. `share_result` is yes / thanks_only / no; part 1 offers only
-- thanks_only and no (the result line in the assistant's words is part 2,
-- D44). `ask_again` feeds the helper's answer record (A6) only, never shown.
CREATE TABLE IF NOT EXISTS helper_thanks (
  id              BIGSERIAL PRIMARY KEY,
  ask_id          INTEGER     NOT NULL UNIQUE,
  task_id         INTEGER,
  asker_user_id   INTEGER     NOT NULL,
  helper_user_id  INTEGER     NOT NULL,
  card_thread_id  INTEGER,
  state           TEXT        NOT NULL DEFAULT 'offered'
                  CHECK (state IN ('offered', 'decided', 'asked_again')),
  share_result    TEXT        CHECK (share_result IN ('yes', 'thanks_only', 'no')),
  result_line     TEXT,
  ask_again       BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ,
  thanked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_helper_thanks_card ON helper_thanks (card_thread_id, asker_user_id)
  WHERE state IN ('offered', 'decided');
CREATE INDEX IF NOT EXISTS idx_helper_thanks_helper ON helper_thanks (helper_user_id, thanked_at);
