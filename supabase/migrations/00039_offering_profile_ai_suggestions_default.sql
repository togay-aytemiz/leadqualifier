-- Enable AI suggestions by default for offering profiles

ALTER TABLE public.offering_profiles
  ALTER COLUMN ai_suggestions_enabled SET DEFAULT TRUE;

UPDATE public.offering_profiles
SET ai_suggestions_enabled = TRUE
WHERE ai_suggestions_enabled = FALSE;
