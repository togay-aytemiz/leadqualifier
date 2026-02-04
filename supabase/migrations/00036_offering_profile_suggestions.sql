-- Offering profile AI suggestions

ALTER TABLE public.offering_profiles
  ADD COLUMN IF NOT EXISTS ai_suggestions_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.offering_profile_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('skill', 'knowledge', 'batch')),
  source_id UUID,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.offering_profile_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profile suggestions"
  ON public.offering_profile_suggestions FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage offering profile suggestions"
  ON public.offering_profile_suggestions FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_org_idx
  ON public.offering_profile_suggestions (organization_id, created_at DESC);
