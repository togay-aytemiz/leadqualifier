-- RPC function to match knowledge base entries by similarity
-- Usage: supabase.rpc('match_knowledge_base', { query_embedding, filter_org_id, match_threshold, match_count })

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  filter_org_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    1 - (kb.embedding <=> query_embedding) as similarity
  FROM knowledge_base kb
  WHERE kb.organization_id = filter_org_id
  AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
