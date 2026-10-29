-- 284: #8154 (G-208, Giorgi's account, 29 Oct 19:11 Tbilisi). Lika's „ქართველი
-- ფეხბურთელები არ ვიცი. შემიძლია კალათბურთელი შემოგთავაზო" was marked a decline
-- by the typed-decline rule (fixed in typedDecline.ts the same day). This clears
-- the one mark it left; the ask stays answered with her words. Register §90.
-- Undo: UPDATE task_asks SET declined_at = '2026-10-29T15:11:30Z' WHERE id = 31089;
UPDATE task_asks SET declined_at = NULL WHERE id = 31089 AND declined_at IS NOT NULL;
