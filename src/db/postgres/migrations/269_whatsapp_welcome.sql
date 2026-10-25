-- 269: Netai's welcome in WhatsApp when a person turns the channel on (Misho,
-- 25 Oct, via the frontend). Kept per person so turning the switch off and on
-- again does not send it twice.
ALTER TABLE whatsapp_consent ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;
