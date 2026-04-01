-- Organization-scoped onboarding progress for the dashboard checklist shell.

CREATE TABLE IF NOT EXISTS public.organization_onboarding_states (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    first_seen_at TIMESTAMPTZ,
    intro_acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_organization_onboarding_states_updated_at
    ON public.organization_onboarding_states;
CREATE TRIGGER update_organization_onboarding_states_updated_at
    BEFORE UPDATE ON public.organization_onboarding_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.organization_onboarding_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org onboarding states"
    ON public.organization_onboarding_states FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org members can manage onboarding states"
    ON public.organization_onboarding_states FOR ALL
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    )
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );
