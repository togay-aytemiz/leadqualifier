-- Add organization_id to messages table to simplify RLS and enable robust Realtime
ALTER TABLE public.messages 
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from conversations
UPDATE public.messages m
SET organization_id = c.organization_id
FROM public.conversations c
WHERE m.conversation_id = c.id;

-- Make it NOT NULL after backfill
ALTER TABLE public.messages 
ALTER COLUMN organization_id SET NOT NULL;

-- Drop old complex RLS policies for messages
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Org admins can manage messages" ON public.messages;

-- Create new simple RLS policies for messages (Index-friendly, Join-free)
CREATE POLICY "Users can view messages"
    ON public.messages FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage messages"
    ON public.messages FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Create index for performance
CREATE INDEX idx_messages_organization_id ON public.messages(organization_id);
