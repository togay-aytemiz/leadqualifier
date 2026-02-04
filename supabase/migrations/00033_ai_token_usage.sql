-- Track AI token usage per organization

CREATE TABLE IF NOT EXISTS public.organization_ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_ai_usage_org_id_idx
    ON public.organization_ai_usage (organization_id, created_at DESC);

ALTER TABLE public.organization_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org ai usage"
    ON public.organization_ai_usage FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org members can insert ai usage"
    ON public.organization_ai_usage FOR INSERT
    WITH CHECK (
        is_org_member(organization_id, auth.uid())
        OR is_system_admin_secure()
    );
