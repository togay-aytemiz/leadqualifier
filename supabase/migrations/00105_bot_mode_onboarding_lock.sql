ALTER TABLE public.organization_ai_settings
    ADD COLUMN IF NOT EXISTS bot_mode_unlock_required BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS bot_mode_unlocked_at TIMESTAMPTZ NULL;

UPDATE public.organization_ai_settings
SET
    bot_mode = COALESCE(bot_mode, 'active'),
    bot_mode_unlock_required = false
WHERE bot_mode_unlock_required IS DISTINCT FROM false;

ALTER TABLE public.organization_ai_settings
    ALTER COLUMN bot_mode SET DEFAULT 'off',
    ALTER COLUMN bot_mode_unlock_required SET DEFAULT true;
