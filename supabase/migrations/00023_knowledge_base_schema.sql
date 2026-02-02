-- Create knowledge_base table for RAG
CREATE TABLE public.knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT,
    embedding vector(1536), -- 1536 dimensions for OpenAI text-embedding-3-small
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. View Policy: Users can see knowledge base of their organization
CREATE POLICY "Users can view org knowledge base"
    ON public.knowledge_base FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

-- 2. Manage Policy: Org Admins can insert/update/delete
CREATE POLICY "Org admins can manage knowledge base"
    ON public.knowledge_base FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Index for Vector Search (Cosine Similarity)
-- Note: Requires `vector` extension but it's likely already enabled for skills
CREATE INDEX ON public.knowledge_base USING hnsw (embedding vector_cosine_ops);

-- Index for Organization (Standard Filtering)
CREATE INDEX idx_knowledge_base_org ON public.knowledge_base(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_base_updated_at
    BEFORE UPDATE ON public.knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
