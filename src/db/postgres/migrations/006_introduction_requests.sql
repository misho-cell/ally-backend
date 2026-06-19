CREATE TABLE introduction_requests (
  id                SERIAL PRIMARY KEY,
  requester_user_id INTEGER NOT NULL,
  mediator_user_id  INTEGER NOT NULL,
  target_name       TEXT   NOT NULL,
  message           TEXT,
  status            TEXT   NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined')),
  mediator_response TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  responded_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intro_requests_mediator
  ON introduction_requests(mediator_user_id, status);

CREATE INDEX IF NOT EXISTS idx_intro_requests_requester
  ON introduction_requests(requester_user_id, status);
