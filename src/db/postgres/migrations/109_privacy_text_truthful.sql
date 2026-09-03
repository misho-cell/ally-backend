-- 109: the privacy answer says what the product actually does now.
-- (Ticket 9 task 31.6.)
--
-- The sentence being replaced:
--
--   "What others can see about your contacts is limited to facts several
--    people have independently confirmed — never anything you saved privately."
--
-- Both halves stopped being true, and this is the text Netai reads out when a
-- user asks about privacy — the one place where a stale sentence is not a
-- documentation problem but a false statement to the person it is about.
--
-- Half one: since 1 September (the founder's ruling, D81) a TRUSTED CURATOR's
-- facts are public the moment they are written, with no second source. That is
-- deliberate and it is how the researched profiles reach the network — but
-- "several people have independently confirmed" no longer describes it.
--
-- Half two: "never anything you saved privately" is true about the TEXT and
-- false about the effect. A private note marked matchable can still bring its
-- subject back in someone else's search; what never travels is the wording.
-- Saying "never" flattens a distinction the product spent a whole round
-- getting right, and a user who learns the real rule later would be right to
-- feel misled.
UPDATE netai_info
SET content = replace(
      content,
      'What others can see about your contacts is limited to facts several people have independently confirmed — never anything you saved privately.',
      'What others can see about your contacts is limited to facts more than one person has independently confirmed, plus facts recorded by the small number of trusted curators the team has named, which are shared as written. Anything you saved privately keeps its text to itself: a private note is never shown to anyone, though it can still help Netai know who to suggest.'
    ),
    updated_at = NOW()
WHERE topic = 'privacy'
  AND content LIKE '%facts several people have independently confirmed%';
