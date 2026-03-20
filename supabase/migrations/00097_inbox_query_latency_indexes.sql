-- Improve inbox refresh and conversation-open latency on hot query paths.

CREATE INDEX IF NOT EXISTS conversations_org_last_message_idx
ON public.conversations (organization_id, last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
ON public.messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_org_sender_conversation_idx
ON public.messages (organization_id, sender_type, conversation_id);
