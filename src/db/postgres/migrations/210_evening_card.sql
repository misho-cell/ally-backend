-- #1850 (founder, 6 Oct): a person still gets at most two new questions a day
-- at once; everything else that arrived for them is shown ONCE, as one card,
-- at 19:00 their own time. The card has one snooze for all its items
-- („not now, in two hours"); each item keeps its own yes / no / later.
--
-- One card per person per local day. due_at is 19:00 in their zone; a snooze
-- moves it. sent_at is stamped by the one sweep that sends it, so a card goes
-- once per due time (a snooze clears it, and the card comes back once).
CREATE TABLE IF NOT EXISTS evening_cards (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  card_date  DATE NOT NULL,
  due_at     TIMESTAMPTZ NOT NULL,
  sent_at    TIMESTAMPTZ,
  snoozes    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, card_date)
);
CREATE INDEX IF NOT EXISTS idx_evening_cards_due ON evening_cards (due_at) WHERE sent_at IS NULL;

-- A question held for the card, and the ask it became when the card went.
ALTER TABLE held_asks ADD COLUMN IF NOT EXISTS evening_card_id BIGINT;
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS evening_card_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_task_asks_evening_card ON task_asks (evening_card_id)
  WHERE evening_card_id IS NOT NULL;
