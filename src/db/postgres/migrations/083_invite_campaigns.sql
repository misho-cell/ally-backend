-- Ticket 6, engine T8: "Chorus" — fully automatic invite campaigns targeting
-- T7's weekly non-user list. Per target, a campaign owns a set of inviter
-- participants, each walking pending -> asked -> agreed/declined -> told ->
-- joined. Both tables are new and start empty — no backfill, safe DDL.

CREATE TABLE IF NOT EXISTS invite_campaigns (
  id SERIAL PRIMARY KEY,
  target_phone TEXT NOT NULL,
  target_label TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  ask_count_dial INTEGER NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_reason TEXT
);

ALTER TABLE invite_campaigns DROP CONSTRAINT IF EXISTS invite_campaigns_status_check;
ALTER TABLE invite_campaigns ADD CONSTRAINT invite_campaigns_status_check
  CHECK (status IN ('open', 'closed_joined', 'closed_declined_all', 'closed_exhausted'));

-- One OPEN campaign per target at a time (the spec's "one campaign per
-- target" rule) — a partial unique index enforces it without a lookup race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_campaigns_open_target
  ON invite_campaigns (target_phone) WHERE status = 'open';
-- The 90-day cooldown check scans every campaign (any status) for a target,
-- most recent first.
CREATE INDEX IF NOT EXISTS idx_invite_campaigns_target_opened
  ON invite_campaigns (target_phone, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_campaigns_status ON invite_campaigns (status);

CREATE TABLE IF NOT EXISTS invite_campaign_participants (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES invite_campaigns(id),
  inviter_user_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  scheduled_ask_at TIMESTAMPTZ NOT NULL,
  asked_at TIMESTAMPTZ,
  thread_id INTEGER,
  state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invite_campaign_participants DROP CONSTRAINT IF EXISTS invite_campaign_participants_state_check;
ALTER TABLE invite_campaign_participants ADD CONSTRAINT invite_campaign_participants_state_check
  CHECK (state IN ('pending', 'asked', 'agreed', 'declined', 'told', 'joined'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_campaign_participants_unique
  ON invite_campaign_participants (campaign_id, inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_campaign_participants_campaign
  ON invite_campaign_participants (campaign_id);
-- The scheduler's own due-query: pending asks whose stagger delay has elapsed.
CREATE INDEX IF NOT EXISTS idx_invite_campaign_participants_due
  ON invite_campaign_participants (scheduled_ask_at) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS idx_invite_campaign_participants_inviter
  ON invite_campaign_participants (inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_campaign_participants_thread
  ON invite_campaign_participants (thread_id);

-- The campaign ask needs its own thread type — a plain 'regular' thread would
-- carry the wrong intent (respond_to_invite_campaign is scoped to threads of
-- this type, see chorusCampaign.service.ts).
ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_type_check;
ALTER TABLE threads ADD CONSTRAINT threads_type_check
  CHECK (type = ANY (ARRAY['regular', 'incoming_request', 'outgoing_request', 'incoming_ask', 'campaign_invite']));
