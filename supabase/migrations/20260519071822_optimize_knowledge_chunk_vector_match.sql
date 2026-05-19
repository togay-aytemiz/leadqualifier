-- Bound knowledge chunk vector candidate selection before document filtering.
-- Large imported crawl collections can otherwise hit API statement timeouts
-- while the query searches enough threshold-matching rows.

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
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
STABLE
AS $$
    WITH nearest_chunks AS MATERIALIZED (
        SELECT
            kc.id,
            kc.document_id,
            kc.content,
            kc.embedding <=> query_embedding AS distance
        FROM public.knowledge_chunks kc
        WHERE kc.organization_id = filter_org_id
            AND kc.embedding IS NOT NULL
        ORDER BY kc.embedding <=> query_embedding
        LIMIT LEAST(GREATEST(match_count * 100, 1000), 5000)
    )
    SELECT
        nearest_chunks.id AS chunk_id,
        kd.id AS document_id,
        kd.title AS document_title,
        kd.type AS document_type,
        nearest_chunks.content,
        1 - nearest_chunks.distance AS similarity
    FROM nearest_chunks
    JOIN public.knowledge_documents kd ON nearest_chunks.document_id = kd.id
    WHERE kd.organization_id = filter_org_id
        AND kd.status = 'ready'
        AND (filter_collection_id IS NULL OR kd.collection_id = filter_collection_id)
        AND (filter_type IS NULL OR kd.type = filter_type)
        AND (filter_language IS NULL OR kd.language = filter_language)
        AND 1 - nearest_chunks.distance >= match_threshold
    ORDER BY nearest_chunks.distance
    LIMIT match_count;
$$;
