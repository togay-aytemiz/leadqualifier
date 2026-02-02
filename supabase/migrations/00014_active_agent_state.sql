-- Add active_agent column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS active_agent TEXT NOT NULL DEFAULT 'bot' 
CHECK (active_agent IN ('bot', 'operator'));

-- Update existing conversations to 'operator' if the last sender was 'user'
-- This is a one-time migration fix
WITH last_senders AS (
    SELECT DISTINCT ON (conversation_id) conversation_id, sender_type
    FROM public.messages
    ORDER BY conversation_id, created_at DESC
)
UPDATE public.conversations c
SET active_agent = 'operator'
FROM last_senders ls
WHERE c.id = ls.conversation_id
AND ls.sender_type = 'user';
