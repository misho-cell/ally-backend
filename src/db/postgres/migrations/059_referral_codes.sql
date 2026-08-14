-- 059: unique referral code per user (founder decision, ticket 5 PART F.1:
-- registration invites by CODE, not by the inviter's phone number). Codes are
-- generated lazily on first read (see referralCode.service) — no backfill
-- needed, and a user who never shares one never gets one.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_referral_code
  ON "User"(referral_code) WHERE referral_code IS NOT NULL;
