-- 091: Ticket 7 task 6 item 3 — "get_invite_link counts as sent" counted the
-- wrong event: one tool call moved the funnel with nothing sent. The funnel
-- gains 'issued' (the assistant handed the user their link) and 'sent' is
-- reserved for the REAL share action (the share-sheet tap the app reports
-- via POST /auth/referral/shared). Existing 'sent' rows were all written by
-- the tool call, so they are re-labelled to what they actually were.
ALTER TABLE referral_link_events DROP CONSTRAINT IF EXISTS referral_link_events_event_check;
ALTER TABLE referral_link_events ADD CONSTRAINT referral_link_events_event_check
  CHECK (event IN ('issued', 'sent', 'opened'));
UPDATE referral_link_events SET event = 'issued' WHERE event = 'sent';
