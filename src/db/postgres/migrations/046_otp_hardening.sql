-- P0: registration and login must prove control of the phone number.
-- verifyOTP now RECORDS a verification here; registerUser / completeLogin
-- CONSUME it (single use, short TTL) before minting a session. Until now the
-- OTP round-trip was advisory — enforced only by the client's flow order.
CREATE TABLE IF NOT EXISTS phone_verifications (
  phone_digits TEXT      NOT NULL,
  action_type  TEXT      NOT NULL,
  verified_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phone_digits, action_type)
);

-- Per-phone OTP send accounting. Per-IP and per-device limits already exist;
-- this closes the remaining hole (many senders, one victim phone).
CREATE TABLE IF NOT EXISTS otp_sends (
  id           BIGSERIAL PRIMARY KEY,
  phone_digits TEXT      NOT NULL,
  sent_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_sends_phone ON otp_sends (phone_digits, sent_at DESC);
