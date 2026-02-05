-- Control AI suggestion mode for required intake fields separately
ALTER TABLE public.offering_profiles
ADD COLUMN IF NOT EXISTS required_intake_fields_ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;
