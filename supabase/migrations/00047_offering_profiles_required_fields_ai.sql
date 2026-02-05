-- Track which required intake fields are AI-generated
ALTER TABLE public.offering_profiles
ADD COLUMN IF NOT EXISTS required_intake_fields_ai TEXT[] NOT NULL DEFAULT '{}';
