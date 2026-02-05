-- Track locale on offering profile suggestions and backfill existing rows

ALTER TABLE public.offering_profile_suggestions
  ADD COLUMN IF NOT EXISTS locale TEXT;

UPDATE public.offering_profile_suggestions
SET locale = CASE
    WHEN content ~ '[ğĞşŞıİçÇöÖüÜ]' THEN 'tr'
    ELSE 'en'
END
WHERE locale IS NULL;

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_locale_idx
  ON public.offering_profile_suggestions (organization_id, locale, status, created_at DESC);
