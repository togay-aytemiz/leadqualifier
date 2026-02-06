-- Persist manual custom note for offering profile when AI suggestions are enabled
ALTER TABLE public.offering_profiles
ADD COLUMN IF NOT EXISTS manual_profile_note TEXT NOT NULL DEFAULT '';
