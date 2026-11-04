-- 293: #8713 part 2 (Tornike, 4 Nov): a member may take Netai's notifications on WhatsApp
-- only — one notification, not the app's and WhatsApp's both, and independent of whether
-- app notifications are on. Off for everyone until the member turns it on.
ALTER TABLE whatsapp_consent ADD COLUMN IF NOT EXISTS whatsapp_only BOOLEAN NOT NULL DEFAULT FALSE;
