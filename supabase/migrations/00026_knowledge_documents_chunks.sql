-- Knowledge documents (raw content) and chunks (embedded) for enterprise-grade RAG

-- Documents table
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES public.knowledge_collections(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'article', -- 'article', 'snippet', 'pdf', etc.
    source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'file', 'legacy', etc.
    content TEXT NOT NULL,
    language TEXT,
    status TEXT NOT NULL DEFAULT 'ready', -- 'ready', 'processing', 'error'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chunks table
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    token_count INT,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org ON public.knowledge_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_collection ON public.knowledge_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org ON public.knowledge_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON public.knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_vector ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY "Users can view org knowledge documents"
    ON public.knowledge_documents FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage knowledge documents"
    ON public.knowledge_documents FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- RLS Policies for chunks
CREATE POLICY "Users can view org knowledge chunks"
    ON public.knowledge_chunks FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage knowledge chunks"
    ON public.knowledge_chunks FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Trigger for updated_at on documents
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON public.knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Retrieval RPC for chunks
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
        kc.id as chunk_id,
        kd.id as document_id,
        kd.title as document_title,
        kd.type as document_type,
        kc.content,
        1 - (kc.embedding <=> query_embedding) as similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE kc.organization_id = filter_org_id
        AND kd.status = 'ready'
        AND (filter_collection_id IS NULL OR kd.collection_id = filter_collection_id)
        AND (filter_type IS NULL OR kd.type = filter_type)
        AND (filter_language IS NULL OR kd.language = filter_language)
        AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Legacy migration: copy existing knowledge_base rows into documents + chunks
INSERT INTO public.knowledge_documents (
    id,
    organization_id,
    collection_id,
    title,
    type,
    source,
    content,
    language,
    status,
    created_at,
    updated_at
)
SELECT
    kb.id,
    kb.organization_id,
    kb.collection_id,
    COALESCE(kb.title, substring(kb.content from 1 for 30) || '...'),
    COALESCE(kb.type, 'article'),
    'legacy',
    kb.content,
    NULL,
    'ready',
    kb.created_at,
    kb.updated_at
FROM public.knowledge_base kb
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.knowledge_chunks (
    document_id,
    organization_id,
    chunk_index,
    content,
    token_count,
    embedding
)
SELECT
    kb.id,
    kb.organization_id,
    0,
    kb.content,
    NULL,
    kb.embedding
FROM public.knowledge_base kb
WHERE kb.embedding IS NOT NULL
ON CONFLICT DO NOTHING;
