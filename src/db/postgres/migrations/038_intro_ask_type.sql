-- request_introduction can now ask the mediator for one of two things: a warm
-- introduction, or (when the target is not on Ally) to share the target's
-- contact. The choice is stored so the eventual reply keeps its context.
-- Existing requests default to 'intro'.
ALTER TABLE introduction_requests
  ADD COLUMN IF NOT EXISTS ask_type TEXT NOT NULL DEFAULT 'intro';

ALTER TABLE introduction_requests
  DROP CONSTRAINT IF EXISTS introduction_requests_ask_type_check;
ALTER TABLE introduction_requests
  ADD CONSTRAINT introduction_requests_ask_type_check
  CHECK (ask_type IN ('intro', 'share_contact'));
