-- Speed up large-corpus lexical RAG fallbacks that use ILIKE over chunk
-- content and document titles. These indexes are general retrieval
-- infrastructure; they do not encode customer-specific phrases.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS knowledge_chunks_content_trgm_idx
    ON public.knowledge_chunks
    USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS knowledge_documents_title_trgm_idx
    ON public.knowledge_documents
    USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunks_org_document_idx
    ON public.knowledge_chunks (organization_id, document_id);

CREATE INDEX IF NOT EXISTS knowledge_documents_ready_org_id_idx
    ON public.knowledge_documents (organization_id, id)
    WHERE status = 'ready';
