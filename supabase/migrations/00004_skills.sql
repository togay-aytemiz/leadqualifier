-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Skills table
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trigger_examples TEXT[] NOT NULL DEFAULT '{}',
  response_text TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill embeddings for semantic search
CREATE TABLE skill_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  trigger_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_skills_org_id ON skills(organization_id);
CREATE INDEX idx_skills_enabled ON skills(enabled);
CREATE INDEX idx_skill_embeddings_skill_id ON skill_embeddings(skill_id);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_skill_embeddings_vector ON skill_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Create embedding search function
CREATE OR REPLACE FUNCTION match_skills(
  query_embedding vector(1536),
  org_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  skill_id UUID,
  title TEXT,
  response_text TEXT,
  trigger_text TEXT,
  similarity FLOAT
) AS $$
  SELECT 
    s.id as skill_id,
    s.title,
    s.response_text,
    se.trigger_text,
    1 - (se.embedding <=> query_embedding) as similarity
  FROM skill_embeddings se
  JOIN skills s ON se.skill_id = s.id
  WHERE s.organization_id = org_id
    AND s.enabled = true
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;

-- RLS policies for skills
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_embeddings ENABLE ROW LEVEL SECURITY;

-- Skills policies
CREATE POLICY "Users can view their org skills" 
  ON skills FOR SELECT 
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can insert skills" 
  ON skills FOR INSERT 
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can update skills" 
  ON skills FOR UPDATE 
  USING (is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can delete skills" 
  ON skills FOR DELETE 
  USING (is_org_admin(organization_id, auth.uid()));

-- Skill embeddings policies
CREATE POLICY "Users can view skill embeddings for their org" 
  ON skill_embeddings FOR SELECT 
  USING (skill_id IN (
    SELECT id FROM skills 
    WHERE organization_id IN (SELECT get_user_organizations(auth.uid()))
  ));

CREATE POLICY "Service role manages embeddings" 
  ON skill_embeddings FOR ALL 
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
