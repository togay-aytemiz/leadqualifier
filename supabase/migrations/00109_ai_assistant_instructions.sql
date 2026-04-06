ALTER TABLE public.organization_ai_settings
    ADD COLUMN IF NOT EXISTS assistant_role TEXT,
    ADD COLUMN IF NOT EXISTS assistant_intake_rule TEXT,
    ADD COLUMN IF NOT EXISTS assistant_never_do TEXT,
    ADD COLUMN IF NOT EXISTS assistant_other_instructions TEXT;
