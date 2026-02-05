-- Offering profile suggestion update linkage

ALTER TABLE public.offering_profile_suggestions
  ADD COLUMN IF NOT EXISTS update_of UUID REFERENCES public.offering_profile_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_update_of_idx
  ON public.offering_profile_suggestions (organization_id, update_of, created_at DESC);
