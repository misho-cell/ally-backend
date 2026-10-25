-- 270: #7725 (tester's engagement desk C-0020, 25 Oct): the admin's browser tool
-- reported an error three times while the send had gone through, and a retry
-- would have sent the message twice. A send may carry the caller's own key;
-- the same key for the same person is one message.
ALTER TABLE netai_messages ADD COLUMN IF NOT EXISTS client_msg_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_netai_messages_client_key
  ON netai_messages (user_id, client_msg_id) WHERE client_msg_id IS NOT NULL;
