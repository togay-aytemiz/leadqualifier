-- Organization-scoped predefined message templates for Inbox composer

CREATE TABLE public.inbox_predefined_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inbox_predefined_templates_title_not_blank CHECK (length(btrim(title)) > 0),
    CONSTRAINT inbox_predefined_templates_content_not_blank CHECK (length(btrim(content)) > 0),
    CONSTRAINT inbox_predefined_templates_title_max_len CHECK (char_length(title) <= 80),
    CONSTRAINT inbox_predefined_templates_content_max_len CHECK (char_length(content) <= 2000)
);

CREATE INDEX idx_inbox_predefined_templates_org_updated
    ON public.inbox_predefined_templates (organization_id, updated_at DESC);

ALTER TABLE public.inbox_predefined_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inbox predefined templates"
    ON public.inbox_predefined_templates FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Users can insert inbox predefined templates"
    ON public.inbox_predefined_templates FOR INSERT
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Users can update inbox predefined templates"
    ON public.inbox_predefined_templates FOR UPDATE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    )
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Users can delete inbox predefined templates"
    ON public.inbox_predefined_templates FOR DELETE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE TRIGGER update_inbox_predefined_templates_updated_at
    BEFORE UPDATE ON public.inbox_predefined_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
