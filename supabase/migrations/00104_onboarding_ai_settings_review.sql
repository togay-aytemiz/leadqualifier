ALTER TABLE public.organization_onboarding_states
    ADD COLUMN IF NOT EXISTS ai_settings_reviewed_at TIMESTAMPTZ;
