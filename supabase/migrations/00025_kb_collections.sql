-- Create knowledge_collections table (Folders)
CREATE TABLE public.knowledge_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'folder', -- e.g. 'folder', 'credit-card', 'file-text'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for collections
ALTER TABLE public.knowledge_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Collections
CREATE POLICY "Users can view org collections"
    ON public.knowledge_collections FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage collections"
    ON public.knowledge_collections FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Add Reference to knowledge_base
ALTER TABLE public.knowledge_base 
    ADD COLUMN collection_id UUID REFERENCES public.knowledge_collections(id) ON DELETE SET NULL,
    ADD COLUMN title TEXT, -- For display name (e.g. filename)
    ADD COLUMN type TEXT DEFAULT 'article'; -- 'article', 'snippet', 'pdf', etc.

-- Migrate existing data (optional, but good practice)
-- If we had data, we might want to put them in a "Default" collection, but for now we leave them null.
-- We can set a default title if missing.
UPDATE public.knowledge_base SET title = substring(content from 1 for 30) || '...' WHERE title IS NULL;
UPDATE public.knowledge_base SET title = 'Untitled' WHERE title IS NULL; -- Fallback

ALTER TABLE public.knowledge_base ALTER COLUMN title SET NOT NULL;

-- Index for Collection
CREATE INDEX idx_knowledge_base_collection ON public.knowledge_base(collection_id);

-- Trigger for collections updated_at
CREATE TRIGGER update_knowledge_collections_updated_at
    BEFORE UPDATE ON public.knowledge_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
