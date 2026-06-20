-- Return the best matching embedding row for each Skill before applying the
-- requested candidate limit. This prevents one Skill's many trigger/fact
-- embeddings from consuming the entire selector candidate window.

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
  WITH ranked_embeddings AS (
    SELECT
      s.id AS skill_id,
      s.title,
      s.response_text,
      s.routing_description,
      s.coverage_facets,
      se.trigger_text,
      1 - (se.embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (
        PARTITION BY s.id
        ORDER BY se.embedding <=> query_embedding
      ) AS embedding_rank
    FROM public.skill_embeddings se
    JOIN public.skills s ON se.skill_id = s.id
    WHERE s.organization_id = org_id
      AND s.enabled = true
      AND 1 - (se.embedding <=> query_embedding) >= match_threshold
  )
  SELECT
    ranked_embeddings.skill_id,
    ranked_embeddings.title,
    ranked_embeddings.response_text,
    ranked_embeddings.routing_description,
    ranked_embeddings.coverage_facets,
    ranked_embeddings.trigger_text,
    ranked_embeddings.similarity
  FROM ranked_embeddings
  WHERE embedding_rank = 1
  ORDER BY similarity DESC
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
