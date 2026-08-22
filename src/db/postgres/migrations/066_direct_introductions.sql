-- 066: direct member-to-member introduction requests (ticket 6, task 18).
-- A direct case ("B wants to meet C", C a member in B's phonebook) stores NO
-- mediator — the target themself answers. Live row #793 stored
-- mediator = target and introduced a person to herself; NULL is the honest
-- shape. Mediated rows are untouched.
ALTER TABLE introduction_requests ALTER COLUMN mediator_user_id DROP NOT NULL;
