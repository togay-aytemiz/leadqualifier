-- Org-level AI settings (strict/flexible)

CREATE TABLE IF NOT EXISTS public.organization_ai_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'strict' CHECK (mode IN ('strict', 'flexible')),
    skill_threshold FLOAT NOT NULL DEFAULT 0.6,
    kb_threshold FLOAT NOT NULL DEFAULT 0.5,
    fallback_topic_limit INT NOT NULL DEFAULT 6,
    strict_fallback_text TEXT NOT NULL DEFAULT 'Şu konularda yardımcı olabilirim: {topics}. Hangisiyle ilgileniyorsunuz?',
    flexible_prompt TEXT NOT NULL DEFAULT 'You are an AI assistant for a business. Be concise, friendly, and respond in the user''s language. Never invent prices, policies, or services. If you are unsure, ask a clarifying question. When generating fallback guidance, only use the provided list of topics.',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER update_organization_ai_settings_updated_at
    BEFORE UPDATE ON public.organization_ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.organization_ai_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view org ai settings"
    ON public.organization_ai_settings FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage ai settings"
    ON public.organization_ai_settings FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Backfill existing organizations
INSERT INTO public.organization_ai_settings (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- Auto-create settings for new organizations
CREATE OR REPLACE FUNCTION handle_new_org_ai_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_ai_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created_ai_settings ON public.organizations;
CREATE TRIGGER on_organization_created_ai_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_org_ai_settings();
