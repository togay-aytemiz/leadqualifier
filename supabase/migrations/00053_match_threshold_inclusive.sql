-- Align similarity threshold semantics with UI: threshold is inclusive (>=)

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
    s.id AS skill_id,
    s.title,
    s.response_text,
    se.trigger_text,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM skill_embeddings se
  JOIN skills s ON se.skill_id = s.id
  WHERE s.organization_id = org_id
    AND s.enabled = true
    AND 1 - (se.embedding <=> query_embedding) >= match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;

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
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.organization_id = filter_org_id
    AND 1 - (kb.embedding <=> query_embedding) >= match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding vector(1536),
    filter_org_id UUID,
    match_threshold float,
    match_count int,
    filter_collection_id UUID DEFAULT NULL,
    filter_type TEXT DEFAULT NULL,
    filter_language TEXT DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    document_title TEXT,
    document_type TEXT,
    content TEXT,
    similarity float
)
LANGUAGE sql
AS $$
    SELECT
        kc.id AS chunk_id,
        kd.id AS document_id,
        kd.title AS document_title,
        kd.type AS document_type,
        kc.content,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE kc.organization_id = filter_org_id
        AND kd.status = 'ready'
        AND (filter_collection_id IS NULL OR kd.collection_id = filter_collection_id)
        AND (filter_type IS NULL OR kd.type = filter_type)
        AND (filter_language IS NULL OR kd.language = filter_language)
        AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
$$;
