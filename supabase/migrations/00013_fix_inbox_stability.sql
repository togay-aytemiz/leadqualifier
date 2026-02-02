-- Fix Inbox Stability

-- 1. Ensure unique conversations (prevent duplicates)
-- logic: A contact on a platform for an org should have only ONE open conversation? 
-- Actually, maybe we want multiple closed ones, but only one 'open'?
-- For now, let's just say one conversation per contact number per platform per org.
-- If we want history, we can archive it, but typically "Conversation" is the thread.
CREATE UNIQUE INDEX IF NOT EXISTS idx_distinct_conversations 
ON public.conversations (organization_id, platform, contact_phone);

-- 2. Trigger to update last_message_at on new message
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        updated_at = NOW() -- also update updated_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_conv_timestamp ON public.messages;
CREATE TRIGGER tr_update_conv_timestamp
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_timestamp();

-- 3. Simplify RLS for Messages (Audit)
-- Drop existing to be safe and recreate
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Org admins can manage messages" ON public.messages;

-- Allow users to view messages if they belong to the org of the conversation
CREATE POLICY "Users can view messages_v2"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (
                c.organization_id IN (SELECT get_user_organizations(auth.uid()))
                OR is_system_admin_secure()
            )
        )
    );

-- Allow users to insert messages (e.g. operators)
CREATE POLICY "Users can insert messages_v2"
    ON public.messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (
                c.organization_id IN (SELECT get_user_organizations(auth.uid()))
                OR is_system_admin_secure()
            )
        )
    );

-- Allow users to update messages
CREATE POLICY "Users can update messages_v2"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (
                c.organization_id IN (SELECT get_user_organizations(auth.uid()))
                OR is_system_admin_secure()
            )
        )
    );
