-- Archive offering profile AI suggestions without deleting them

ALTER TABLE public.offering_profile_suggestions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_archived_idx
  ON public.offering_profile_suggestions (organization_id, archived_at, created_at DESC);
