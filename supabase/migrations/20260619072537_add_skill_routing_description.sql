-- Add internal routing metadata for Skill matching.
-- These fields are not customer-facing; they help semantic matching and verifier decisions.

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS routing_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coverage_facets TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

DROP FUNCTION IF EXISTS public.match_skills(vector, UUID, DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION public.match_skills(
  query_embedding vector(1536),
  org_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  skill_id UUID,
  title TEXT,
  response_text TEXT,
  routing_description TEXT,
  coverage_facets TEXT[],
  trigger_text TEXT,
  similarity FLOAT
) AS $$
  SELECT
    s.id AS skill_id,
    s.title,
    s.response_text,
    s.routing_description,
    s.coverage_facets,
    se.trigger_text,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM public.skill_embeddings se
  JOIN public.skills s ON se.skill_id = s.id
  WHERE s.organization_id = org_id
    AND s.enabled = true
    AND 1 - (se.embedding <=> query_embedding) >= match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
