-- Engine T2 (ticket 6, 20 Aug spec): phonebook labels ("ზურა სანტექნიკოსი")
-- carry starter facts nobody ever reads. Labels the parser cannot resolve
-- land here instead of being silently dropped — one row per (contact,
-- phone), so a re-import never duplicates the same open question.
CREATE TABLE IF NOT EXISTS label_parse_queue (
  id         SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL,
  phone      TEXT NOT NULL,
  alias      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_label_parse_queue_contact ON label_parse_queue (contact_id);
