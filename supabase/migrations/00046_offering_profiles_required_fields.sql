-- Add required intake fields for offering profiles

ALTER TABLE public.offering_profiles
ADD COLUMN IF NOT EXISTS required_intake_fields TEXT[] NOT NULL DEFAULT '{}';
