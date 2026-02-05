-- Offering profile suggestion review workflow and locale tracking

ALTER TABLE public.offering_profiles
  ADD COLUMN IF NOT EXISTS ai_suggestions_locale TEXT NOT NULL DEFAULT 'tr';

ALTER TABLE public.offering_profile_suggestions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.offering_profile_suggestions
SET status = 'pending'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_status_idx
  ON public.offering_profile_suggestions (organization_id, status, created_at DESC);
