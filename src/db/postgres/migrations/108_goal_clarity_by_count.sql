-- 108: question 1 finally scores. (Ticket 9 task 32.4, change 2 — the second
-- half, the one that never landed.)
--
-- The rule as written on 18 August: "for question 1 the score comes from HOW
-- MANY they pick, not which. One pick = goal_clarity +0.7, two = +0.3, three =
-- -0.1. A person who names one thing knows what they want; a person who names
-- three is still looking around."
--
-- Everything was in place except the data. `select_mode='multi'` and
-- `select_max=3` are set, partH.service reads a `_by_count` sub-object and
-- scores by the number of real (non-„სხვა") picks, and the rule itself sits in
-- `scoring_note` as prose — but no row in the bank has ever carried
-- `_by_count`, so `score_vector` for the onboarding question was `{}` and
-- answering it moved NOTHING. The most important question in the bank, the one
-- that builds the first shortlist, has been scoring zero the whole time.
UPDATE question_bank
SET score_vector = jsonb_build_object(
      '_by_count', jsonb_build_object(
        '1', jsonb_build_object('goal_clarity',  0.7),
        '2', jsonb_build_object('goal_clarity',  0.3),
        '3', jsonb_build_object('goal_clarity', -0.1)
      )
    ),
    updated_at = NOW()
WHERE question_id = 'onb_primary_goal_001'
  AND NOT (score_vector ? '_by_count');
