-- Messenger handover §9: task state lives ON the thread so every device sees
-- the same status (the frontend was deriving it from the live run +
-- localStorage, which never synced across devices).
ALTER TABLE threads
  ADD COLUMN is_task     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN status      TEXT    NOT NULL DEFAULT 'done'
                         CHECK (status IN ('working', 'waiting', 'needs_you', 'done', 'failed')),
  ADD COLUMN status_line TEXT;

-- Introduction requests become addressable from the client by an opaque public
-- ref (internal numeric ids are never shown to users), and snoozable.
ALTER TABLE introduction_requests
  ADD COLUMN request_ref   UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN snoozed_until TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_intro_requests_ref
  ON introduction_requests(request_ref);

-- Existing request threads predate the status columns — put them in the state
-- the lifecycle would have: the mediator's incoming thread awaits THEIR answer,
-- the requester's outgoing thread awaits the mediator.
UPDATE threads t
SET is_task = TRUE,
    status = CASE WHEN t.type = 'incoming_request' THEN 'needs_you' ELSE 'waiting' END
FROM introduction_requests ir
WHERE t.introduction_request_id = ir.id
  AND ir.status = 'pending'
  AND t.type IN ('incoming_request', 'outgoing_request');

-- Lightweight product analytics (first consumer: request_resolved
-- {action, source} from the accept/decline/snooze buttons and the chat tool).
CREATE TABLE IF NOT EXISTS product_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER,
  event      TEXT      NOT NULL,
  props      JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_event
  ON product_events(event, created_at DESC);
