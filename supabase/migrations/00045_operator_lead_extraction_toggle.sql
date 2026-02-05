-- Allow lead extraction during operator takeover (org-level toggle)

ALTER TABLE public.organization_ai_settings
ADD COLUMN IF NOT EXISTS allow_lead_extraction_during_operator BOOLEAN NOT NULL DEFAULT FALSE;
