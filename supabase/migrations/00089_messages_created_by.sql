-- Persist operator identity on outbound user messages.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_created_by
ON public.messages(created_by);
