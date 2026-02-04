-- Lead extraction schema: offering profile, service catalog, candidates, leads

-- Offering Profile
CREATE TABLE IF NOT EXISTS public.offering_profiles (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  catalog_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_offering_profiles_updated_at
  BEFORE UPDATE ON public.offering_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.offering_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profiles"
  ON public.offering_profiles FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage offering profiles"
  ON public.offering_profiles FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

INSERT INTO public.offering_profiles (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_org_offering_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.offering_profiles (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created_offering_profile ON public.organizations;
CREATE TRIGGER on_organization_created_offering_profile
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_org_offering_profile();

-- Offering Profile Updates
CREATE TABLE IF NOT EXISTS public.offering_profile_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('skill', 'knowledge')),
  source_id UUID,
  proposed_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.offering_profile_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profile updates"
  ON public.offering_profile_updates FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage offering profile updates"
  ON public.offering_profile_updates FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS offering_profile_updates_org_idx
  ON public.offering_profile_updates (organization_id, status, created_at DESC);

-- Service Catalog (optional)
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org service catalog"
  ON public.service_catalog FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage service catalog"
  ON public.service_catalog FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_org_name_idx
  ON public.service_catalog (organization_id, lower(name));

-- Service Candidates
CREATE TABLE IF NOT EXISTS public.service_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('skill', 'knowledge')),
  source_id UUID,
  proposed_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.service_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org service candidates"
  ON public.service_candidates FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage service candidates"
  ON public.service_candidates FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS service_candidates_org_idx
  ON public.service_candidates (organization_id, status, created_at DESC);

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  service_type TEXT,
  service_fit INT NOT NULL DEFAULT 0,
  intent_score INT NOT NULL DEFAULT 0,
  total_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'cold' CHECK (status IN ('hot', 'warm', 'cold', 'ignored')),
  summary TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  non_business BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org leads"
  ON public.leads FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage leads"
  ON public.leads FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS leads_org_status_idx
  ON public.leads (organization_id, status, updated_at DESC);
