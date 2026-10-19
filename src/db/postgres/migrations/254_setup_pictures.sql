-- #6139 (task 1882, B4+B6; D689): every setup step shows pictures of the real
-- screen, with the tap marked, per gadget and step. Stored here so a picture
-- can be swapped from the admin without a deploy (spec 4.2: when Apple moves a
-- button). One row per picture, in tap order.
CREATE TABLE IF NOT EXISTS setup_pictures (
  id            SERIAL PRIMARY KEY,
  gadget        TEXT NOT NULL,
  step          TEXT NOT NULL,
  position      INTEGER NOT NULL CHECK (position BETWEEN 1 AND 30),
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image         BYTEA NOT NULL,
  caption       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gadget, step, position)
);
