-- Track admin-visible AI latency analytics without mixing them into token accounting.

CREATE TABLE IF NOT EXISTS public.organization_ai_latency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL CHECK (metric_key IN ('lead_extraction', 'llm_response')),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    source TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_ai_latency_events_org_metric_created_idx
    ON public.organization_ai_latency_events (organization_id, metric_key, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_ai_latency_events_conversation_idx
    ON public.organization_ai_latency_events (conversation_id, created_at DESC);

ALTER TABLE public.organization_ai_latency_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org ai latency events"
    ON public.organization_ai_latency_events FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org members can insert ai latency events"
    ON public.organization_ai_latency_events FOR INSERT
    WITH CHECK (
        is_org_member(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can delete ai latency events"
    ON public.organization_ai_latency_events FOR DELETE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );
