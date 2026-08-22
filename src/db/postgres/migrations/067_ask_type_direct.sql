-- 067: the direct introduction case (task 18) stores ask_type = 'direct';
-- the CHECK constraint predates it and refused the insert on first live use.
ALTER TABLE introduction_requests DROP CONSTRAINT IF EXISTS introduction_requests_ask_type_check;
ALTER TABLE introduction_requests
  ADD CONSTRAINT introduction_requests_ask_type_check
  CHECK (ask_type IN ('intro', 'share_contact', 'direct'));
