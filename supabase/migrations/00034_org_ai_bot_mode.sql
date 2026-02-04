-- Add org-level bot mode (active/shadow/off)

ALTER TABLE public.organization_ai_settings
    ADD COLUMN IF NOT EXISTS bot_mode TEXT NOT NULL DEFAULT 'active'
    CHECK (bot_mode IN ('active', 'shadow', 'off'));

UPDATE public.organization_ai_settings
SET bot_mode = 'active'
WHERE bot_mode IS NULL;
