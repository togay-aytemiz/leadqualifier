-- Simplify org AI settings to single threshold + prompt

ALTER TABLE public.organization_ai_settings
    ADD COLUMN IF NOT EXISTS match_threshold FLOAT NOT NULL DEFAULT 0.6,
    ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT 'Şu konularda yardımcı olabilirim: {topics}. Hangisiyle ilgileniyorsunuz?';

-- Backfill match_threshold from existing columns
UPDATE public.organization_ai_settings
SET match_threshold = COALESCE(skill_threshold, kb_threshold, match_threshold);

-- Backfill prompt based on selected mode
UPDATE public.organization_ai_settings
SET prompt = CASE
    WHEN mode = 'flexible' THEN NULLIF(TRIM(flexible_prompt), '')
    ELSE NULLIF(TRIM(strict_fallback_text), '')
END;

UPDATE public.organization_ai_settings
SET prompt = COALESCE(prompt, NULLIF(TRIM(strict_fallback_text), ''), 'Şu konularda yardımcı olabilirim: {topics}. Hangisiyle ilgileniyorsunuz?');

ALTER TABLE public.organization_ai_settings
    DROP COLUMN IF EXISTS skill_threshold,
    DROP COLUMN IF EXISTS kb_threshold,
    DROP COLUMN IF EXISTS fallback_topic_limit,
    DROP COLUMN IF EXISTS strict_fallback_text,
    DROP COLUMN IF EXISTS flexible_prompt;
