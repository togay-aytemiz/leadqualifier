ALTER TABLE public.organization_onboarding_states
    ADD COLUMN IF NOT EXISTS channel_connection_completed_at TIMESTAMPTZ;
