-- ROW 274 — "DECLINED" IS NOT A STATE THIS PRODUCT CAN RECORD, AND IT IS THE
-- ONE ANSWER THAT MATTERS MOST TO A PERSON ASKING FOR HELP.
--
-- Measured before building anything: of 92 answers on the live base, about 8
-- read as refusals. ABOUT — and that estimate is the whole problem. Nothing
-- distinguishes "I don't know anyone" from "here is Gia's number", so the only
-- way to count refusals today is to read them and judge, which is a guess
-- wearing a number's clothes.
--
-- ⚠️ WHY A COLUMN AND NOT A FOURTH STATUS. `task_asks.status` has three values
-- and six readers. `taskAsks.service` already argued this once, in writing,
-- when the bridge's own ask needed closing: "a fourth status is a migration
-- plus every one of those readers." That is still true. A decline IS answered
-- — the asker's question is resolved and their goal must wake — so every
-- existing reader is RIGHT to go on seeing 'answered'. What they cannot see is
-- that the answer was no, and that is what this column adds.
--
-- NULLABLE, with no default: every row written before today says "nobody
-- recorded it", which is the truth about them, and not "this was not a
-- decline" — which would be a claim nobody made.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

-- The reader this exists for asks "how many of the answers were refusals",
-- which is a scan over answered rows. Partial, because the rows that are NOT
-- declines are the overwhelming majority and do not belong in it.
CREATE INDEX IF NOT EXISTS task_asks_declined_idx
  ON task_asks (declined_at)
  WHERE declined_at IS NOT NULL;
