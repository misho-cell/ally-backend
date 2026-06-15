CREATE TABLE IF NOT EXISTS contact_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  neo4j_contact_id TEXT NOT NULL,
  neo4j_contact_name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, neo4j_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_insights_data ON contact_insights USING GIN (data);

CREATE TABLE IF NOT EXISTS insight_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  field_label TEXT NOT NULL,
  field_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO insight_fields (field_key, field_label, field_description)
VALUES
  ('current_employer', 'Current Employer', 'Where does this person work now?'),
  ('last_interaction', 'Last Interaction', 'When did you last speak with this person?'),
  ('influence_score', 'Influence Score (1-10)', 'How influential is this person locally?'),
  ('relationship_strength', 'Relationship Strength', 'How well do you know this person?'),
  ('notes', 'Notes', 'Any additional notes about this person?')
ON CONFLICT (field_key) DO NOTHING;
