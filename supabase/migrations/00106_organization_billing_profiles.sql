CREATE TABLE IF NOT EXISTS public.organization_billing_profiles (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL DEFAULT '',
    billing_email TEXT NOT NULL DEFAULT '',
    billing_phone TEXT,
    tax_identity_number TEXT,
    address_line_1 TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_organization_billing_profiles_updated_at
    BEFORE UPDATE ON public.organization_billing_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.organization_billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org billing profiles" ON public.organization_billing_profiles;
CREATE POLICY "Users can view org billing profiles"
    ON public.organization_billing_profiles FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "Users can insert org billing profiles" ON public.organization_billing_profiles;
CREATE POLICY "Users can insert org billing profiles"
    ON public.organization_billing_profiles FOR INSERT
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "Users can update org billing profiles" ON public.organization_billing_profiles;
CREATE POLICY "Users can update org billing profiles"
    ON public.organization_billing_profiles FOR UPDATE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    )
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "System admins can manage org billing profiles" ON public.organization_billing_profiles;
CREATE POLICY "System admins can manage org billing profiles"
    ON public.organization_billing_profiles FOR ALL
    USING (is_system_admin_secure())
    WITH CHECK (is_system_admin_secure());
