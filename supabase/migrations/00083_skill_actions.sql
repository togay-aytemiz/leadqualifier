ALTER TABLE public.skills
ADD COLUMN IF NOT EXISTS skill_actions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.skills
DROP CONSTRAINT IF EXISTS skills_skill_actions_array_check;

ALTER TABLE public.skills
ADD CONSTRAINT skills_skill_actions_array_check
CHECK (jsonb_typeof(skill_actions) = 'array');
