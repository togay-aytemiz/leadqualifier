-- Add AI suggestions toggle for service catalog management in organization settings.
ALTER TABLE public.offering_profiles
    ADD COLUMN IF NOT EXISTS service_catalog_ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.offering_profiles
SET service_catalog_ai_enabled = TRUE
WHERE service_catalog_ai_enabled IS NULL;

