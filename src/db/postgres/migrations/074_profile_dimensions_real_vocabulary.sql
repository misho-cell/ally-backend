-- profile_dimensions_dimension_check (069, 18 Aug) allowed a 9-name
-- placeholder vocabulary (openness/conscientiousness/extraversion/
-- agreeableness/risk_appetite/network_breadth/reciprocity, plus
-- goal_clarity/pressure_response) written before the real 43-row bank's
-- content existed. The bank that actually loaded (071, 22-24 Aug) scores
-- against a different, more concrete 9-name vocabulary — only
-- goal_clarity and pressure_response overlap. Every real answer whose
-- score_vector touches one of the other 7 real dimensions has been
-- failing this CHECK constraint since Part H shipped (live-caught via
-- answer_profile_question on col_avoid_intro_704, error 23514, table
-- confirmed empty — nothing to migrate, only the constraint was wrong).
-- Replacing it with the vocabulary the bank actually writes.
ALTER TABLE profile_dimensions DROP CONSTRAINT IF EXISTS profile_dimensions_dimension_check;
ALTER TABLE profile_dimensions ADD CONSTRAINT profile_dimensions_dimension_check
  CHECK (dimension IN (
    'goal_clarity','boundary_style','collaboration_style','communication_directness',
    'network_curation','opportunity_appetite','pressure_response','social_approach',
    'structure_need'));
