-- Ticket 20 row 133 — D14: one price everywhere, no qualifier.
--
-- The pricing pack reads "Pro — $19.99/month (the Georgian tier)", and the
-- Georgian price answer in thread 15816 read „Pro, $19.99/თვე (ქართული
-- ტარიფი)". A qualifier on a price implies there is another price for
-- somebody else, which is the thing D14 exists to prevent.
--
-- THIS WAS FIXED ONCE ALREADY (B85), AND CAME BACK BY COPY-PASTE. The phrase
-- was seeded in migration 060; B85 corrected the live row; then 128 (Stripe)
-- and 132 (the weekly window) each rewrote the whole pack from the previous
-- text and carried the old qualifier back in with it. Neither was about
-- pricing wording — they were about Stripe and about tokens — and neither
-- author was choosing to reinstate anything.
--
-- That is why a test now scans the migrations for this phrase, with 060, 128
-- and 132 grandfathered by name: a correction that lives only in a row is one
-- careless paste from being undone, and it has already happened twice.
--
-- Everything else in the pack is left exactly as it stands. Only the four
-- words come out.
UPDATE netai_info
SET content = replace(content, ' (the Georgian tier)', ''),
    updated_at = NOW()
WHERE topic = 'pricing'
  AND content LIKE '%(the Georgian tier)%';
