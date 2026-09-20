-- Ticket 20, item 5 — HOW an accepted introduction is made, not just whether.
--
-- Misho's design, confirmed 20 September: when the assistant asks a mediator to
-- connect two people it must also ask, up front, whether the two are put in
-- touch directly or whether the reply keeps coming back through them. The
-- mediator chooses; the product does not assume.
--
--   'direct'       the requester is given the target's contact, as today
--   'via_mediator' the contact is NOT handed over; the mediator stays in the
--                  middle and carries the messages
--
-- NULL is every request answered before the question existed. It is not a
-- third option and must never be read as one: it means nobody was asked.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS intro_channel TEXT;
