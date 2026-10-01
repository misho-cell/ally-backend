-- M1 (plate v288, Misho's word 1 October 22:40 Tbilisi): admin logins of their
-- own for Misho, Gio, Lika and Ninia; Tornike keeps account 501.
--
-- Misho chose SEPARATE admin accounts over admin rights on their Netai
-- accounts: their threads, wallets and contacts stay exactly as they are, and
-- an admin login is one row that can be switched off without touching a
-- person's product account.
--
-- WHY A TABLE AND NOT A FLAG. An admin account is a "User" row with
-- "hasAccessToAlly" = true and no inviter — exactly what the attribution
-- watcher counts as a registration the referral path lost. Like test_seats,
-- every staff account is recorded here, and every count of people excludes it.
CREATE TABLE IF NOT EXISTS staff_accounts (
  user_id    INTEGER     PRIMARY KEY,
  -- Who it is for, as the person is known on the team ("Misho", "Gio").
  name       TEXT        NOT NULL,
  -- The admin account that created it.
  created_by TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
