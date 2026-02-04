-- Add bot name to org AI settings

ALTER TABLE public.organization_ai_settings
    ADD COLUMN IF NOT EXISTS bot_name TEXT NOT NULL DEFAULT 'Bot';

UPDATE public.organization_ai_settings
SET bot_name = 'Bot'
WHERE bot_name IS NULL OR trim(bot_name) = '';
