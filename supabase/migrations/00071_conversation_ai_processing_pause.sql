-- Conversation-level AI processing pause switch
-- When enabled, inbound automation keeps storing messages but skips
-- lead extraction and AI replies for this specific conversation.
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS ai_processing_paused BOOLEAN NOT NULL DEFAULT FALSE;
