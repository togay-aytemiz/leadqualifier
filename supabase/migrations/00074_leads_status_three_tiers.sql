-- Simplify lead status model to cold/warm/hot only.
-- Backfill legacy statuses before tightening the check constraint.

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_status_check;

UPDATE public.leads
SET status = 'cold'
WHERE status NOT IN ('hot', 'warm', 'cold');

ALTER TABLE public.leads
ADD CONSTRAINT leads_status_check
CHECK (status IN ('hot', 'warm', 'cold'));
