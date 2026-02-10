-- Add undetermined lead status for insufficient-information conversations.

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
ADD CONSTRAINT leads_status_check
CHECK (status IN ('hot', 'warm', 'cold', 'ignored', 'undetermined'));
