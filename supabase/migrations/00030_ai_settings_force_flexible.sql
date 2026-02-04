-- Force AI settings mode to flexible (no mode selection)

ALTER TABLE public.organization_ai_settings
    ALTER COLUMN mode SET DEFAULT 'flexible';

UPDATE public.organization_ai_settings
SET mode = 'flexible';
